'use client';
import * as React from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Plus, ShieldCheck } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { getTokenRole } from '@/lib/auth/token-role';
import {
  deleteCoverage,
  listCoverages,
  type PatientCoverage,
} from '@/lib/patients/coverages-api';
import { canCreatePayer, listPayers, type Payer } from '@/lib/payers/payers-api';
import {
  coverageStatusBadge,
  coverageValidityLabel,
} from '@/lib/patients/coverage-presentation';
import { PAYER_TYPE_LABELS } from '@/components/payers/payer-labels';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionError } from '@/components/errors/section-error';
import { EmptyState } from '@/components/shared/empty-state';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { CoverageDialog } from './coverage-dialog';

// Copy as constants (i18n-ready) — es first, matches the rest of the app.
export const coverageCopy = {
  heading: 'Cobertura',
  add: 'Añadir cobertura',
  loading: 'Cargando cobertura',
  loadError: 'No pudimos cargar la cobertura del paciente.',
  emptyTitle: 'Sin cobertura registrada',
  emptyHint:
    'Registra el pagador, el plan y el número de afiliado para tenerlos a mano al cobrar.',
  primary: 'Principal',
  member: (n: string) => `Afiliado n.º ${n}`,
  policyHolder: (name: string) => `Titular: ${name}`,
  edit: 'Editar',
  remove: 'Quitar',
  editLabel: (payer: string) => `Editar la cobertura de ${payer}`,
  removeLabel: (payer: string) => `Quitar la cobertura de ${payer}`,
  removeTitle: 'Quitar cobertura',
  removeDescription: (payer: string) =>
    `Se quita la cobertura de ${payer} de este paciente. El pagador sigue en el catálogo de la clínica.`,
  removeError: 'No pudimos quitar la cobertura.',
  saved: 'Cobertura guardada.',
  removed: 'Cobertura quitada.',
};
const copy = coverageCopy;

interface PatientCoverageSectionProps {
  token: string;
  patientId: string;
  /** Tras guardar o quitar: la ficha relee el resumen de la cabecera. */
  onChanged?: () => void;
}

/**
 * Bloque «Cobertura» de la ficha (DX-153): pagador, plan y n.º de afiliado del
 * paciente. Carga lo suyo (esqueleto → error con reintento → vacío o lista);
 * alta y edición en un modal, quitar con confirmación. Lo gestionan los 4
 * roles; crear un pagador nuevo, solo ADMIN y RECEPTION.
 */
export function PatientCoverageSection({
  token,
  patientId,
  onChanged,
}: PatientCoverageSectionProps) {
  const ids = useId();
  const [coverages, setCoverages] = useState<PatientCoverage[] | null>(null);
  const [payers, setPayers] = useState<Payer[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [dialog, setDialog] = useState<{ coverage: PatientCoverage | null } | null>(null);
  const [removing, setRemoving] = useState<PatientCoverage | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Tras quitar, su botón «Quitar» ya no existe: el foco pasa a «Añadir
  // cobertura» en vez de perderse en <body> (WCAG 2.4.3).
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const removedRef = useRef(false);

  // Se vacía antes de anunciar: el mismo texto dos veces seguidas («Cobertura
  // guardada.») no cambia el contenido de la región y no se volvería a leer.
  const announceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (announceTimer.current) clearTimeout(announceTimer.current);
    },
    [],
  );
  const clearNotice = useCallback(() => {
    if (announceTimer.current) clearTimeout(announceTimer.current);
    setNotice(null);
  }, []);
  const announce = (text: string) => {
    clearNotice();
    announceTimer.current = setTimeout(() => setNotice(text), 50);
  };
  useEffect(() => {
    let cancelled = false;
    Promise.all([listCoverages(token, patientId), listPayers(token)])
      .then(([list, catalog]) => {
        if (cancelled) return;
        setCoverages(list);
        setPayers(catalog);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        clearNotice();
        setLoadError(apiErrorMessage(err, { fallback: copy.loadError }));
      });
    return () => {
      cancelled = true;
    };
  }, [token, patientId, reloadKey, clearNotice]);

  const reload = () => setReloadKey((k) => k + 1);
  const mayCreatePayer = canCreatePayer(getTokenRole(token));

  async function confirmRemove() {
    if (!removing) return;
    setRemoveBusy(true);
    setRemoveError(null);
    clearNotice();
    try {
      await deleteCoverage(token, patientId, removing.id);
      removedRef.current = true;
      setRemoving(null);
      announce(copy.removed);
      reload();
      onChanged?.();
    } catch (err) {
      clearNotice();
      setRemoveError(apiErrorMessage(err, { fallback: copy.removeError }));
    } finally {
      setRemoveBusy(false);
    }
  }

  function content() {
    if (loadError) {
      return (
        <SectionError
          description={loadError}
          onRetry={() => {
            setLoadError(null);
            setCoverages(null);
            reload();
          }}
          className="py-8"
        />
      );
    }
    if (!coverages) {
      return (
        <div role="status" aria-label={copy.loading} className="flex flex-col gap-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      );
    }
    if (coverages.length === 0) {
      return (
        <EmptyState
          role="status"
          icon={<ShieldCheck aria-hidden />}
          title={copy.emptyTitle}
          description={copy.emptyHint}
        />
      );
    }
    return (
      <ul className="flex flex-col divide-y divide-hairline rounded-xl border border-border bg-surface">
        {coverages.map((c) => {
          const statusBadge = coverageStatusBadge(c);
          return (
            <li
              key={c.id}
              data-testid="coverage-row"
              className="flex min-w-0 flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="break-words font-medium text-ink">{c.payer.name}</span>
                  <span className="text-sm text-muted">{PAYER_TYPE_LABELS[c.payer.type]}</span>
                </span>
                {c.planName ? <span className="break-words text-sm text-ink">{c.planName}</span> : null}
                {c.memberNumber ? (
                  <span className="break-words text-sm text-muted tabular-nums">
                    {copy.member(c.memberNumber)}
                  </span>
                ) : null}
                {c.policyHolderName ? (
                  <span className="break-words text-sm text-muted">
                    {copy.policyHolder(c.policyHolderName)}
                  </span>
                ) : null}
                <span className="text-sm text-muted tabular-nums">{coverageValidityLabel(c)}</span>
                {c.isPrimary || statusBadge ? (
                  <span className="flex flex-wrap gap-1.5">
                    {c.isPrimary ? <Badge variant="success">{copy.primary}</Badge> : null}
                    {statusBadge ? (
                      <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
                    ) : null}
                  </span>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  aria-label={copy.editLabel(c.payer.name)}
                  onClick={() => {
                    clearNotice();
                    setDialog({ coverage: c });
                  }}
                  className="max-sm:h-11 max-sm:flex-1"
                >
                  {copy.edit}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={copy.removeLabel(c.payer.name)}
                  onClick={() => {
                    clearNotice();
                    setRemoveError(null);
                    setRemoving(c);
                  }}
                  className="max-sm:h-11 max-sm:flex-1"
                >
                  {copy.remove}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <section
      aria-labelledby={`${ids}-heading`}
      data-testid="patient-coverage"
      className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-surface p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${ids}-heading`} className="text-base font-semibold text-ink">
          {copy.heading}
        </h3>
        {coverages ? (
          <Button
            ref={addButtonRef}
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              clearNotice();
              setDialog({ coverage: null });
            }}
            className="max-sm:h-11 max-sm:w-full"
          >
            <Plus aria-hidden />
            {copy.add}
          </Button>
        ) : null}
      </div>
      <p role="status" className={notice ? 'text-sm text-success' : 'sr-only'}>
        {notice}
      </p>
      {content()}

      {dialog ? (
        <CoverageDialog
          open
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
          token={token}
          patientId={patientId}
          coverage={dialog.coverage}
          payers={payers}
          canCreatePayer={mayCreatePayer}
          // Con una sola cobertura viva (o ninguna) la API la deja principal.
          onlyCoverage={
            dialog.coverage ? (coverages?.length ?? 0) === 1 : (coverages?.length ?? 0) === 0
          }
          onSaved={() => {
            announce(copy.saved);
            reload();
            onChanged?.();
          }}
          onPayerCreated={(created) => setPayers((prev) => [...prev, created])}
        />
      ) : null}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open && !removeBusy) setRemoving(null);
        }}
        title={copy.removeTitle}
        description={removing ? copy.removeDescription(removing.payer.name) : undefined}
        confirmLabel={copy.remove}
        onConfirm={() => void confirmRemove()}
        confirming={removeBusy}
        error={removeError}
        onCloseAutoFocus={(event) => {
          if (!removedRef.current) return;
          removedRef.current = false;
          event.preventDefault();
          addButtonRef.current?.focus();
        }}
      />
    </section>
  );
}
