'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { NotebookPen, Plus, Smile } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { getTokenRole } from '@/lib/auth/token-role';
import {
  canReadOrtho,
  canWriteOrtho,
  listOrthoCases,
  listOrthoVisits,
  openOrthoCase,
  ORTHO_ELASTIC_TYPE_LABELS,
  ORTHO_ELASTIC_WEAR_LABELS,
  ORTHO_HYGIENE_LABELS,
  ORTHO_INCIDENT_LABELS,
  ORTHO_TECHNIQUE_LABELS,
  wireLabel,
  type OrthoCase,
  type OrthoVisit,
} from '@/lib/ortho/ortho-api';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { AsyncSection } from '@/components/shared/async-section';
import { SectionError } from '@/components/errors/section-error';
import { RowActions } from '@/components/shared/row-actions';
import { Button } from '@/components/ui/button';
import { DescriptionItem, DescriptionList } from '@/components/ui/description-list';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { nextStatuses } from './ortho-status-dialog';
import { OrthoAccountSection } from './ortho-account-section';
import { OrthoAlignersSection } from './ortho-aligners-section';
import { OrthoAccountsView } from './ortho-accounts-view';
import { canReadOrthoAccount } from '@/lib/ortho/ortho-billing';

// Los diálogos llegan en su propio trozo, al abrirlos (presupuesto de la ficha).
const OrthoCaseDialog = dynamic(() => import('./ortho-case-dialog').then((m) => m.OrthoCaseDialog), {
  ssr: false,
});
const OrthoVisitDialog = dynamic(() => import('./ortho-visit-dialog').then((m) => m.OrthoVisitDialog), {
  ssr: false,
});
const OrthoStatusDialog = dynamic(() => import('./ortho-status-dialog').then((m) => m.OrthoStatusDialog), {
  ssr: false,
});
const ClinicalEntryAddendumModal = dynamic(
  () => import('@/components/patients/clinical-entry-addendum-modal').then((m) => m.ClinicalEntryAddendumModal),
  { ssr: false },
);

export const orthoTabCopy = {
  heading: 'Ortodoncia',
  support:
    'El caso del paciente, su progreso y cada control. Un control guardado no se edita: se corrige con una adenda.',
  createCase: 'Crear caso',
  registerVisit: 'Registrar control',
  changeStatus: 'Cambiar estado',
  caseActions: 'Acciones del caso de ortodoncia',
  empty: 'Este paciente no tiene caso de ortodoncia',
  emptyHint: 'Crea el caso con la técnica, la duración y los controles previstos.',
  emptyHintReadOnly: 'El caso lo abren odontología y administración.',
  loadError: 'No pudimos cargar el caso de ortodoncia.',
  visitsError: 'No pudimos cargar los controles.',
  loading: 'Cargando el caso de ortodoncia',
  technique: 'Técnica',
  start: 'Inicio',
  provider: 'Responsable',
  location: 'Sede',
  interval: 'Intervalo',
  intervalValue: (days: number) => `Cada ${days} días`,
  bonded: 'Cementado',
  progressLabel: 'Controles realizados',
  progress: (done: number, planned: number) => `${done}/${planned} controles`,
  months: (elapsed: number, estimated: number) => `Mes ${elapsed} de ${estimated}`,
  currentWire: 'Arco actual',
  upper: 'Superior',
  lower: 'Inferior',
  noWire: 'Sin registrar',
  lastVisit: 'Último control',
  noVisits: 'Sin controles',
  nextProposed: 'Próximo control propuesto',
  overdue: 'Atrasado',
  statusReason: (reason: string) => `Motivo: ${reason}`,
  history: 'Historial de controles',
  historyEmpty: 'Aún no hay controles registrados en este caso.',
  visitTitle: (n: number, date: string) => `Control ${n} · ${date}`,
  by: (name: string) => `Registró ${name}`,
  elastics: 'Elásticos',
  incidents: 'Incidencias',
  hygiene: 'Higiene',
  appliance: 'Aparatología',
  next: 'Próximo control',
  addAddendum: 'Añadir adenda',
  addendaHeading: 'Adendas',
  addendumBy: (name: string, when: string) => `${name} · ${when}`,
  unknownUser: 'Un miembro del equipo',
  previousCases: 'Casos anteriores',
  previousCase: (technique: string, start: string) => `${technique} · desde ${start}`,
  noGauges: 'La clínica no tiene calibres de arco configurados.',
};
const copy = orthoTabCopy;

interface OrthoTabProps {
  token: string;
  patientId: string;
  /** Calibres de la lista de la clínica (Ajustes › Ortodoncia). */
  wireGauges: readonly string[];
  /** Cita del acceso directo de la agenda: abre «Registrar control» desde ella. */
  visitAppointmentId?: string | null;
  /** Avisa de que el acceso directo ya se usó (la página limpia la URL). */
  onShortcutConsumed?: () => void;
}

function TabSkeleton() {
  return (
    <div role="status" aria-label={copy.loading} className="flex flex-col gap-3">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}

type Dialog =
  | { kind: 'case' }
  | { kind: 'visit'; appointmentId: string | null }
  | { kind: 'status' }
  | { kind: 'addendum'; visit: OrthoVisit }
  | null;

/**
 * Pestaña «Ortodoncia» de la ficha (DX-190), para los roles clínicos y solo si
 * la clínica activó el módulo: cabecera del caso, barra de progreso, arco
 * actual e historial de controles con sus adendas. Abrir, cerrar y registrar
 * controles, solo odontología y ADMIN (la API lo vuelve a comprobar).
 */
export function OrthoTab({ token, patientId, wireGauges, visitAppointmentId = null, onShortcutConsumed }: OrthoTabProps) {
  const role = getTokenRole(token);
  const canWrite = canWriteOrtho(role);
  const [cases, setCases] = useState<OrthoCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [visits, setVisits] = useState<OrthoVisit[] | null>(null);
  const [visitsError, setVisitsError] = useState<string | null>(null);
  const [visitsKey, setVisitsKey] = useState(0);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [shortcutUsed, setShortcutUsed] = useState(false);
  const current = cases[0] ?? null;
  const open = openOrthoCase(cases);
  const stamp = useSedeStamp(
    token,
    cases.map((c) => c.locationId),
  );

  const clinical = canReadOrtho(role);
  useEffect(() => {
    // Recepción no lee el caso clínico (DX-285: ve solo la cuenta).
    if (!clinical) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await listOrthoCases(token, patientId);
        if (cancelled) return;
        setCases(data);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(apiErrorMessage(err, copy.loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, patientId, reloadKey, clinical]);

  const currentId = current?.id ?? null;
  useEffect(() => {
    if (!currentId) return;
    let cancelled = false;
    listOrthoVisits(token, patientId, currentId)
      .then((data) => {
        if (cancelled) return;
        setVisits(data);
        setVisitsError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setVisitsError(apiErrorMessage(err, copy.visitsError));
      });
    return () => {
      cancelled = true;
    };
  }, [token, patientId, currentId, visitsKey]);

  // Acceso directo de la agenda: con el caso ya leído, «Registrar control»
  // desde la cita (estado derivado; se apaga al cerrar el formulario).
  const shortcutOpen = !shortcutUsed && !loading && Boolean(visitAppointmentId) && canWrite && open !== null;
  const visitDialog: { appointmentId: string | null } | null = shortcutOpen
    ? { appointmentId: visitAppointmentId }
    : dialog?.kind === 'visit'
      ? dialog
      : null;

  function closeDialog() {
    if (shortcutOpen) {
      setShortcutUsed(true);
      onShortcutConsumed?.();
    }
    setDialog(null);
  }

  function refresh() {
    setReloadKey((k) => k + 1);
    setVisitsKey((k) => k + 1);
  }

  if (!clinical) {
    // DX-285: recepción ve solo la cuenta de los casos (no el caso clínico).
    return canReadOrthoAccount(role) ? <OrthoAccountsView token={token} patientId={patientId} /> : null;
  }

  const actions =
    canWrite && current ? (
      <div className="flex w-full items-center gap-2 sm:w-auto">
        {open ? (
          <Button type="button" onClick={() => setDialog({ kind: 'visit', appointmentId: null })} className="flex-1 sm:flex-none">
            <NotebookPen aria-hidden />
            {copy.registerVisit}
          </Button>
        ) : (
          <Button type="button" onClick={() => setDialog({ kind: 'case' })} className="flex-1 sm:flex-none">
            <Plus aria-hidden />
            {copy.createCase}
          </Button>
        )}
        {nextStatuses(current.status).length > 0 ? (
          <RowActions
            label={copy.caseActions}
            actions={[{ label: copy.changeStatus, onSelect: () => setDialog({ kind: 'status' }) }]}
            className="pointer-coarse:size-11"
          />
        ) : null}
      </div>
    ) : null;

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        as="h3"
        title={copy.heading}
        description={<span className="block max-w-[68ch]">{copy.support}</span>}
        actions={actions}
      />
      <SedeStampNote stamp={stamp} />
      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        isEmpty={current === null}
        emptyTitle={copy.empty}
        emptyDescription={canWrite ? copy.emptyHint : copy.emptyHintReadOnly}
        emptyIcon={<Smile aria-hidden />}
        emptyAction={
          canWrite ? (
            <Button type="button" onClick={() => setDialog({ kind: 'case' })}>
              <Plus aria-hidden />
              {copy.createCase}
            </Button>
          ) : null
        }
        skeleton={<TabSkeleton />}
      >
        {current ? (
          <div className="flex flex-col gap-6">
            <CaseSummary orthoCase={current} stamp={stamp} />
            <OrthoAccountSection
              token={token}
              patientId={patientId}
              caseId={current.id}
              plannedVisits={current.plannedVisits}
              canWrite={canWrite}
              closed={current.status === 'FINISHED' || current.status === 'ABANDONED'}
              stamp={stamp}
              reloadKey={reloadKey}
            />
            {current.technique === 'ALIGNERS' ? (
              <OrthoAlignersSection
                token={token}
                patientId={patientId}
                caseId={current.id}
                locationId={current.locationId}
                canWrite={canWrite}
                closed={current.status === 'FINISHED' || current.status === 'ABANDONED'}
                visits={(visits ?? []).map((v) => ({
                  id: v.id,
                  visitNumber: v.visitNumber,
                  visitDate: v.visitDate,
                  label: copy.visitTitle(v.visitNumber, stamp.civilDate(v.visitDate, current.locationId)),
                }))}
                stamp={stamp}
              />
            ) : null}
            <section aria-labelledby="ortho-history" className="flex flex-col gap-3">
              <h4 id="ortho-history" className="t-title text-ink">
                {copy.history}
              </h4>
              {visitsError ? (
                <SectionError title={copy.visitsError} description={visitsError} onRetry={() => setVisitsKey((k) => k + 1)} />
              ) : visits === null ? (
                <Skeleton className="h-20 w-full" />
              ) : visits.length === 0 ? (
                <p className="text-sm text-muted">{copy.historyEmpty}</p>
              ) : (
                <ol aria-label={copy.history} className="overflow-hidden rounded-lg border border-border bg-surface text-sm">
                  {visits.map((visit) => (
                    <VisitItem
                      key={visit.id}
                      visit={visit}
                      locationId={current.locationId}
                      stamp={stamp}
                      onAddendum={() => setDialog({ kind: 'addendum', visit })}
                    />
                  ))}
                </ol>
              )}
            </section>
            {cases.length > 1 ? (
              <section aria-labelledby="ortho-previous" className="flex flex-col gap-2">
                <h4 id="ortho-previous" className="t-label text-muted">
                  {copy.previousCases}
                </h4>
                <ul className="flex flex-col gap-2 text-sm">
                  {cases.slice(1).map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-2">
                      <StatusBadge kind="orthoCase" status={c.status} />
                      <span className="text-ink">
                        {copy.previousCase(ORTHO_TECHNIQUE_LABELS[c.technique], stamp.civilDate(c.startDate, c.locationId))}
                      </span>
                      <span className="t-data text-muted">{copy.progress(c.progress.visitsDone, c.progress.plannedVisits)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : null}
      </AsyncSection>

      {dialog?.kind === 'case' ? (
        <OrthoCaseDialog
          open
          onOpenChange={(o) => !o && closeDialog()}
          token={token}
          patientId={patientId}
          onCreated={() => refresh()}
        />
      ) : null}
      {visitDialog && open ? (
        <OrthoVisitDialog
          open
          onOpenChange={(o) => !o && closeDialog()}
          token={token}
          patientId={patientId}
          caseId={open.id}
          wireGauges={wireGauges}
          previousUpper={open.currentUpperWire}
          previousLower={open.currentLowerWire}
          intervalDays={open.visitIntervalDays}
          appointmentId={visitDialog.appointmentId}
          onRegistered={() => refresh()}
        />
      ) : null}
      {dialog?.kind === 'status' && current ? (
        <OrthoStatusDialog
          open
          onOpenChange={(o) => !o && closeDialog()}
          token={token}
          orthoCase={current}
          onChanged={() => refresh()}
        />
      ) : null}
      {dialog?.kind === 'addendum' ? (
        <ClinicalEntryAddendumModal
          open
          onOpenChange={(o) => !o && closeDialog()}
          token={token}
          patientId={patientId}
          entryId={dialog.visit.clinicalEntryId}
          entryDateLabel={stamp.civilDate(dialog.visit.visitDate, current?.locationId)}
          onCreated={() => setVisitsKey((k) => k + 1)}
        />
      ) : null}
    </div>
  );
}

type Stamp = ReturnType<typeof useSedeStamp>;

function CaseSummary({ orthoCase: c, stamp }: { orthoCase: OrthoCase; stamp: Stamp }) {
  const { visitsDone, plannedVisits, monthsElapsed, estimatedMonths, percent } = c.progress;
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge kind="orthoCase" status={c.status} />
        {c.overdue ? <StatusBadge kind="orthoFollowUp" status="OVERDUE" /> : null}
        {c.statusReason ? <span className="text-sm text-muted">{copy.statusReason(c.statusReason)}</span> : null}
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span id={`ortho-progress-${c.id}`} className="t-label text-ink">
            {copy.progressLabel}
          </span>
          <span className="t-data text-sm text-ink">
            {copy.progress(visitsDone, plannedVisits)} · {copy.months(monthsElapsed, estimatedMonths)}
          </span>
        </div>
        <div
          role="progressbar"
          aria-labelledby={`ortho-progress-${c.id}`}
          aria-valuemin={0}
          aria-valuemax={plannedVisits}
          aria-valuenow={Math.min(visitsDone, plannedVisits)}
          aria-valuetext={copy.progress(visitsDone, plannedVisits)}
          className="h-2 overflow-hidden rounded-full bg-surface-active"
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
      </div>
      <DescriptionList columns={3}>
        <DescriptionItem label={copy.currentWire} wide>
          <span className="flex flex-col gap-0.5">
            <span className="t-data">
              {copy.upper}: {wireLabel(c.currentUpperWire) ?? copy.noWire}
            </span>
            <span className="t-data">
              {copy.lower}: {wireLabel(c.currentLowerWire) ?? copy.noWire}
            </span>
          </span>
        </DescriptionItem>
        <DescriptionItem label={copy.lastVisit} numeric>
          {c.lastVisitDate ? stamp.civilDate(c.lastVisitDate, c.locationId) : copy.noVisits}
        </DescriptionItem>
        {c.nextVisitProposedOn ? (
          <DescriptionItem label={copy.nextProposed} numeric>
            {stamp.civilDate(c.nextVisitProposedOn, c.locationId)}
          </DescriptionItem>
        ) : null}
        <DescriptionItem label={copy.technique}>{ORTHO_TECHNIQUE_LABELS[c.technique]}</DescriptionItem>
        <DescriptionItem label={copy.start} numeric>
          {stamp.civilDate(c.startDate, c.locationId)}
        </DescriptionItem>
        <DescriptionItem label={copy.interval}>{copy.intervalValue(c.visitIntervalDays)}</DescriptionItem>
        <DescriptionItem label={copy.provider}>{c.providerName ?? copy.unknownUser}</DescriptionItem>
        <DescriptionItem label={copy.location}>{c.locationName}</DescriptionItem>
        {c.bondedOn ? (
          <DescriptionItem label={copy.bonded} numeric>
            {stamp.civilDate(c.bondedOn, c.locationId)}
          </DescriptionItem>
        ) : null}
      </DescriptionList>
    </div>
  );
}

function VisitItem({
  visit,
  locationId,
  stamp,
  onAddendum,
}: {
  visit: OrthoVisit;
  locationId: string;
  stamp: Stamp;
  onAddendum: () => void;
}) {
  const facts: [string, string][] = [];
  const upper = wireLabel(visit.upperWire);
  const lower = wireLabel(visit.lowerWire);
  if (upper) facts.push([copy.upper, upper]);
  if (lower) facts.push([copy.lower, lower]);
  if (visit.elasticsType) {
    const wear = visit.elasticsWear ? ` · ${ORTHO_ELASTIC_WEAR_LABELS[visit.elasticsWear]}` : '';
    facts.push([copy.elastics, `${ORTHO_ELASTIC_TYPE_LABELS[visit.elasticsType]}${wear}`]);
  }
  if (visit.incidents.length > 0) {
    facts.push([copy.incidents, visit.incidents.map((i) => ORTHO_INCIDENT_LABELS[i]).join(', ')]);
  }
  if (visit.hygieneIndex) facts.push([copy.hygiene, ORTHO_HYGIENE_LABELS[visit.hygieneIndex]]);
  if (visit.applianceChanges) facts.push([copy.appliance, visit.applianceChanges]);
  if (visit.nextVisitProposedOn) facts.push([copy.next, stamp.civilDate(visit.nextVisitProposedOn, locationId)]);
  const note = visit.notes.split('\n\n').slice(1).join('\n\n');
  return (
    <li className="flex flex-col gap-2 border-b border-border-subtle px-4 py-3 [overflow-wrap:anywhere] last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="t-data font-medium text-ink">
            {copy.visitTitle(visit.visitNumber, stamp.civilDate(visit.visitDate, locationId))}
          </span>
          <span className="t-caption text-muted">
            {copy.by(visit.authorName ?? copy.unknownUser)} · {stamp.dateTime(visit.createdAt, locationId)}
          </span>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onAddendum}>
          {copy.addAddendum}
        </Button>
      </div>
      {facts.length > 0 ? (
        <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {facts.map(([label, value]) => (
            <div key={label} className="flex min-w-0 gap-1">
              <dt className="text-muted">{label}:</dt>
              <dd className="t-data min-w-0 text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {note ? <p className="whitespace-pre-line text-ink">{note}</p> : null}
      {visit.addenda.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-lg border-l-2 border-border bg-surface-2 px-3 py-2">
          <span className="t-label text-muted">{copy.addendaHeading}</span>
          {visit.addenda.map((a) => (
            <div key={a.id} className="flex flex-col gap-0.5">
              <p className="whitespace-pre-line text-ink">{a.text}</p>
              <span className="t-caption text-muted">
                {a.reason ? `${a.reason} · ` : ''}
                {copy.addendumBy(a.authorName ?? copy.unknownUser, stamp.dateTime(a.createdAt, locationId))}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </li>
  );
}
