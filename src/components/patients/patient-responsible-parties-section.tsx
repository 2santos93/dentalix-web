'use client';
import * as React from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { UserPlus, Users } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  getPatientResponsibles,
  partyDocument,
  RELATIONSHIP_LABELS,
  removeResponsibleParty,
  type PatientResponsibles,
  type ResponsibleParty,
} from '@/lib/patients/responsible-parties-api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionError } from '@/components/errors/section-error';
import { EmptyState } from '@/components/shared/empty-state';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { ResponsiblePartyDialog } from './responsible-party-dialog';

// Copy as constants (i18n-ready) — es first, matches the rest of the app.
export const responsiblesCopy = {
  heading: 'Responsable y familia',
  add: 'Añadir responsable',
  loading: 'Cargando responsables',
  loadError: 'No pudimos cargar los responsables del paciente.',
  emptyTitle: 'Sin responsable registrado',
  emptyHint:
    'Añade a quien paga o recibe los avisos: la madre, el acudiente o un familiar. Puede ser otro paciente o un contacto sin ficha.',
  payer: 'Pagador principal',
  notices: 'Recibe avisos',
  migrated: 'Antes en «Acudiente»',
  isPatient: 'Paciente',
  edit: 'Editar',
  remove: 'Quitar',
  editLabel: (name: string) => `Editar a ${name}`,
  removeLabel: (name: string) => `Quitar a ${name}`,
  removeTitle: 'Quitar responsable',
  removeDescription: (name: string) =>
    `${name} deja de ser responsable de este paciente: ya no recibirá sus avisos ni saldrá en su estado de cuenta familiar.`,
  removeError: 'No pudimos quitar el responsable.',
  responsibleFor: 'Responsable de',
  family: 'Familiares',
  noticesTo: (name: string | null, email: string | null) =>
    `Los avisos de este paciente van a ${name ?? 'su responsable'}${email ? ` (${email})` : ''}.`,
  minorNoResponsible: (age: number) =>
    `Es menor de ${age} años: añade un responsable con email para que reciba sus recordatorios y recibos.`,
  saved: 'Responsable guardado.',
  removed: 'Responsable quitado.',
};
const copy = responsiblesCopy;

const patientHref = (id: string) => `/patients/${encodeURIComponent(id)}`;

/** Chip con enlace a la ficha de un familiar que es paciente. */
function FamilyChip({ id, name, detail }: { id: string; name: string; detail: string }) {
  return (
    <Link
      href={patientHref(id)}
      className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-sm text-ink transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
    >
      <span className="truncate font-medium">{name}</span>
      <span className="shrink-0 text-xs text-muted">· {detail}</span>
    </Link>
  );
}

interface PatientResponsiblePartiesSectionProps {
  token: string;
  patientId: string;
}

/**
 * Bloque «Responsable y familia» de la ficha (DX-203): quién paga y quién
 * recibe los avisos del paciente (otro paciente o un contacto sin ficha), y de
 * quién es responsable. Carga lo suyo (esqueleto → error con reintento →
 * vacío o lista); alta y edición en un modal, quitar con confirmación. Lo
 * gestionan los 4 roles (datos de cobro, no clínicos).
 */
export function PatientResponsiblePartiesSection({
  token,
  patientId,
}: PatientResponsiblePartiesSectionProps) {
  const ids = useId();
  const [data, setData] = useState<PatientResponsibles | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [dialog, setDialog] = useState<{ party: ResponsibleParty | null } | null>(null);
  const [removing, setRemoving] = useState<ResponsibleParty | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Tras quitar, su botón «Quitar» ya no existe: el foco pasa a «Añadir
  // responsable» en vez de perderse en <body> (WCAG 2.4.3).
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const removedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getPatientResponsibles(token, patientId)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(apiErrorMessage(err, { fallback: copy.loadError }));
      });
    return () => {
      cancelled = true;
    };
  }, [token, patientId, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  async function confirmRemove() {
    if (!removing) return;
    setRemoveBusy(true);
    setRemoveError(null);
    try {
      await removeResponsibleParty(token, patientId, removing.id);
      removedRef.current = true;
      setRemoving(null);
      setNotice(copy.removed);
      reload();
    } catch (err) {
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
          <Skeleton className="h-14 w-full" />
        </div>
      );
    }
    const familyPatients = data.parties.flatMap((p) =>
      p.responsiblePatient ? [{ party: p, patientId: p.responsiblePatient.id }] : [],
    );
    const recipient = data.noticeRecipient;
    return (
      <div className="flex flex-col gap-4">
        {data.parties.length === 0 ? (
          <EmptyState role="status" icon={<Users aria-hidden />} title={copy.emptyTitle} description={copy.emptyHint} />
        ) : (
          <ul className="flex flex-col divide-y divide-hairline rounded-xl border border-border bg-surface">
            {data.parties.map((party) => {
              const doc = partyDocument(party);
              const contactLine = [doc, party.email, party.phone].filter(Boolean).join(' · ');
              return (
                <li
                  key={party.id}
                  data-testid="responsible-row"
                  className="flex min-w-0 flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      {party.responsiblePatient ? (
                        <Link
                          href={patientHref(party.responsiblePatient.id)}
                          className="break-words font-medium text-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {party.fullName}
                        </Link>
                      ) : (
                        <span className="break-words font-medium text-ink">{party.fullName}</span>
                      )}
                      <span className="text-sm text-muted">{RELATIONSHIP_LABELS[party.relationship]}</span>
                    </span>
                    {contactLine ? (
                      <span className="break-words text-sm text-muted tabular-nums">{contactLine}</span>
                    ) : null}
                    <span className="flex flex-wrap gap-1.5">
                      {party.kind === 'PATIENT' ? <Badge variant="muted">{copy.isPatient}</Badge> : null}
                      {party.isPayer ? <Badge variant="success">{copy.payer}</Badge> : null}
                      {party.receivesNotices ? <Badge variant="secondary">{copy.notices}</Badge> : null}
                      {party.migratedFromGuardian ? <Badge variant="outline">{copy.migrated}</Badge> : null}
                    </span>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      aria-label={copy.editLabel(party.fullName)}
                      onClick={() => setDialog({ party })}
                      className="max-sm:h-11 max-sm:flex-1"
                    >
                      {copy.edit}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={copy.removeLabel(party.fullName)}
                      onClick={() => {
                        setRemoveError(null);
                        setRemoving(party);
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
        )}

        {recipient.kind === 'RESPONSIBLE' ? (
          <p className="break-words text-sm text-muted">
            {copy.noticesTo(recipient.name, recipient.email)}
          </p>
        ) : data.minor && data.parties.length === 0 ? (
          <p className="text-sm text-warning">{copy.minorNoResponsible(data.majorityAge)}</p>
        ) : null}

        {familyPatients.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h4 className="t-label text-muted">{copy.family}</h4>
            <div className="flex flex-wrap gap-2">
              {familyPatients.map(({ party, patientId: familyId }) => (
                <FamilyChip
                  key={party.id}
                  id={familyId}
                  name={party.fullName}
                  detail={RELATIONSHIP_LABELS[party.relationship]}
                />
              ))}
            </div>
          </div>
        ) : null}

        {data.responsibleFor.length > 0 ? (
          <div className="flex flex-col gap-2" data-testid="responsible-for">
            <h4 className="t-label text-muted">{copy.responsibleFor}</h4>
            <div className="flex flex-wrap gap-2">
              {data.responsibleFor.map((r) => (
                <FamilyChip
                  key={r.id}
                  id={r.patient.id}
                  name={`${r.patient.firstName} ${r.patient.lastName}`}
                  detail={r.isPayer ? copy.payer : RELATIONSHIP_LABELS[r.relationship]}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <section
      aria-labelledby={`${ids}-heading`}
      data-testid="patient-responsibles"
      className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-surface p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${ids}-heading`} className="text-base font-semibold text-ink">
          {copy.heading}
        </h3>
        {data ? (
          <Button
            ref={addButtonRef}
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setDialog({ party: null })}
            className="max-sm:h-11 max-sm:w-full"
          >
            <UserPlus aria-hidden />
            {copy.add}
          </Button>
        ) : null}
      </div>
      <p role="status" className={notice ? 'text-sm text-success' : 'sr-only'}>
        {notice}
      </p>
      {content()}

      {dialog ? (
        <ResponsiblePartyDialog
          open
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
          token={token}
          patientId={patientId}
          party={dialog.party}
          onSaved={() => {
            setNotice(copy.saved);
            reload();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open && !removeBusy) setRemoving(null);
        }}
        title={copy.removeTitle}
        description={removing ? copy.removeDescription(removing.fullName) : undefined}
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
