'use client';
import * as React from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Handshake } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  getPatientAgreement,
  removePatientAgreement,
  type PatientAgreement,
  type PatientAgreementResponse,
} from '@/lib/patients/patient-agreement-api';
import {
  agreementStatusBadge,
  agreementValidityLabel,
} from '@/lib/patients/agreement-presentation';
import { formatCivilDate, formatDate } from '@/lib/format/date';
import { AGREEMENT_KIND_LABELS } from '@/components/agreements/agreement-labels';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionError } from '@/components/errors/section-error';
import { EmptyState } from '@/components/shared/empty-state';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { AgreementDialog } from './agreement-dialog';

// Copy as constants (i18n-ready) — es first, matches the rest of the app.
export const agreementCopy = {
  heading: 'Convenio',
  assign: 'Asignar convenio',
  change: 'Cambiar',
  remove: 'Quitar',
  loading: 'Cargando convenio',
  loadError: 'No pudimos cargar el convenio del paciente.',
  emptyTitle: 'Sin convenio asignado',
  emptyHint:
    'Asigna el convenio de la empresa o aseguradora para que el presupuesto salga con el precio pactado.',
  changeLabel: (name: string) => `Cambiar el convenio ${name}`,
  removeLabel: (name: string) => `Quitar el convenio ${name}`,
  removeTitle: 'Quitar convenio',
  removeDescription: (name: string) =>
    `Se quita el convenio ${name} de este paciente. Queda en el historial y el convenio sigue disponible para otros pacientes.`,
  removeError: 'No pudimos quitar el convenio.',
  saved: 'Convenio guardado.',
  removed: 'Convenio quitado.',
  history: (n: number) => `Historial (${n})`,
  retiredOn: (date: string) => `Retirado el ${date}`,
};
const copy = agreementCopy;

interface PatientAgreementSectionProps {
  token: string;
  patientId: string;
  /** Tras asignar, cambiar o quitar: la ficha relee el resumen de la cabecera. */
  onChanged?: () => void;
}

/**
 * Bloque «Convenio» de la ficha (DX-105): el convenio con el que se presupuesta
 * al paciente. Carga lo suyo (esqueleto → error con reintento → vacío o
 * asignado); asignar y cambiar en un modal, quitar con confirmación; los
 * convenios retirados quedan en un historial plegable.
 */
export function PatientAgreementSection({
  token,
  patientId,
  onChanged,
}: PatientAgreementSectionProps) {
  const ids = useId();
  const [data, setData] = useState<PatientAgreementResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Tras quitar, su botón «Quitar» ya no existe: el foco pasa a «Asignar
  // convenio» en vez de perderse en <body> (WCAG 2.4.3).
  const assignButtonRef = useRef<HTMLButtonElement>(null);
  const removedRef = useRef(false);
  const pendingFocusRef = useRef(false);

  // Se vacía antes de anunciar: el mismo texto dos veces seguidas no cambia el
  // contenido de la región y no se volvería a leer.
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
    getPatientAgreement(token, patientId, { includeHistory: true })
      .then((res) => {
        if (cancelled) return;
        setData(res);
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

  // El botón «Asignar convenio» solo existe cuando la relectura confirma que no
  // queda convenio: el foco se coloca entonces.
  const focusAssignIfReady = useCallback((fresh: PatientAgreementResponse | null) => {
    if (pendingFocusRef.current && fresh && !fresh.current) {
      pendingFocusRef.current = false;
      assignButtonRef.current?.focus();
    }
  }, []);
  useEffect(() => focusAssignIfReady(data), [data, focusAssignIfReady]);

  const reload = () => setReloadKey((k) => k + 1);
  const current = data?.current ?? null;
  const history = data?.history ?? [];

  async function confirmRemove() {
    setRemoveBusy(true);
    setRemoveError(null);
    clearNotice();
    try {
      await removePatientAgreement(token, patientId);
      removedRef.current = true;
      setRemoving(false);
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

  function assigned(a: PatientAgreement) {
    const badge = agreementStatusBadge(a);
    return (
      <div
        data-testid="agreement-current"
        className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-surface px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
      >
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="break-words font-medium text-ink">{a.agreement.name}</span>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </span>
          <span className="break-words text-sm text-ink">{a.agreement.payer.name}</span>
          <span className="text-sm text-muted">{AGREEMENT_KIND_LABELS[a.agreement.kind]}</span>
          <span className="text-sm text-muted tabular-nums">{agreementValidityLabel(a)}</span>
          {a.notes ? <span className="break-words text-sm text-muted">{a.notes}</span> : null}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            ref={assignButtonRef}
            type="button"
            variant="secondary"
            size="sm"
            aria-label={copy.changeLabel(a.agreement.name)}
            onClick={() => {
              clearNotice();
              setDialogOpen(true);
            }}
            className="max-sm:h-11 max-sm:flex-1"
          >
            {copy.change}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={copy.removeLabel(a.agreement.name)}
            onClick={() => {
              clearNotice();
              setRemoveError(null);
              setRemoving(true);
            }}
            className="max-sm:h-11 max-sm:flex-1"
          >
            {copy.remove}
          </Button>
        </div>
      </div>
    );
  }

  function content() {
    if (loadError) {
      return (
        <SectionError
          description={loadError}
          onRetry={() => {
            setLoadError(null);
            setData(null);
            reload();
          }}
          className="py-8"
        />
      );
    }
    if (!data) {
      return (
        <div role="status" aria-label={copy.loading} className="flex flex-col gap-3">
          <Skeleton className="h-14 w-full" />
        </div>
      );
    }
    return (
      <>
        {current ? (
          assigned(current)
        ) : (
          <EmptyState
            role="status"
            icon={<Handshake aria-hidden />}
            title={copy.emptyTitle}
            description={copy.emptyHint}
            action={
              <Button
                ref={assignButtonRef}
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  clearNotice();
                  setDialogOpen(true);
                }}
                className="max-sm:h-11"
              >
                {copy.assign}
              </Button>
            }
          />
        )}
        {history.length > 0 ? (
          <details data-testid="agreement-history" className="text-sm">
            <summary className="cursor-pointer py-2 font-medium text-ink max-sm:min-h-11">
              {copy.history(history.length)}
            </summary>
            <ul className="mt-2 flex flex-col divide-y divide-hairline rounded-xl border border-border">
              {history.map((h) => (
                <li key={h.id} className="flex min-w-0 flex-col gap-0.5 px-4 py-3">
                  <span className="break-words font-medium text-ink">
                    {h.agreement.name} · {h.agreement.payer.name}
                  </span>
                  <span className="text-muted tabular-nums">
                    {h.validFrom ? formatCivilDate(h.validFrom) : 'Sin inicio'}
                    {' – '}
                    {h.validTo ? formatCivilDate(h.validTo) : 'Sin fin'}
                  </span>
                  {h.retiredAt ? (
                    <span className="text-muted tabular-nums">
                      {copy.retiredOn(formatDate(h.retiredAt))}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </>
    );
  }

  return (
    <section
      aria-labelledby={`${ids}-heading`}
      data-testid="patient-agreement"
      className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-surface p-4 sm:p-6"
    >
      <h3 id={`${ids}-heading`} className="text-base font-semibold text-ink">
        {copy.heading}
      </h3>
      <p role="status" className={notice ? 'text-sm text-success' : 'sr-only'}>
        {notice}
      </p>
      {content()}

      {dialogOpen ? (
        <AgreementDialog
          open
          onOpenChange={(open) => {
            if (!open) setDialogOpen(false);
          }}
          token={token}
          patientId={patientId}
          current={current}
          onSaved={() => {
            announce(copy.saved);
            reload();
            onChanged?.();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={removing}
        onOpenChange={(open) => {
          if (!open && !removeBusy) setRemoving(false);
        }}
        title={copy.removeTitle}
        description={current ? copy.removeDescription(current.agreement.name) : undefined}
        confirmLabel={copy.remove}
        onConfirm={() => void confirmRemove()}
        confirming={removeBusy}
        error={removeError}
        onCloseAutoFocus={(event) => {
          if (!removedRef.current) return;
          removedRef.current = false;
          event.preventDefault();
          pendingFocusRef.current = true;
          focusAssignIfReady(data);
        }}
      />
    </section>
  );
}
