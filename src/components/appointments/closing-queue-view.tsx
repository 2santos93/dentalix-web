'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCheck } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import { updateAppointment, type AppointmentStatus } from '@/lib/appointments/appointments-api';
import {
  CLOSING_SECTION_HINTS,
  CLOSING_SECTION_TITLES,
  getClosingQueue,
  type ClosingAppointment,
  type ClosingQueue,
  type ClosingQueueSection,
  type ClosingTreatment,
} from '@/lib/appointments/closing-queue-api';
import { getPlan, type TreatmentPlanItem } from '@/lib/treatment-plans/treatment-plans-api';
import { listLocations, type ClinicLocation } from '@/lib/locations/locations-api';
import { ApiError } from '@/lib/api/api-error';
import { notifyClosingQueueChanged } from '@/components/appointments/closing-queue-count';
import { readyFormat, useSedeFormat } from '@/lib/locations/use-sede-format';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { notifyError } from '@/components/errors/notify';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CancelAppointmentDialog } from '@/components/appointments/cancel-appointment-dialog';
import { DismissClosingDialog } from '@/components/appointments/dismiss-closing-dialog';
import { NewEvolutionModal } from '@/components/clinical-notes/new-evolution-modal';
import { MarkDoneModal } from '@/components/treatment-plans/mark-done-modal';

export const closingQueueCopy = {
  title: 'Pendiente de cerrar',
  description:
    'Lo que quedó sin cerrar de los últimos 14 días hasta ayer, en la hora de cada sede. Ciérralo aquí o descártalo con un motivo.',
  back: 'Agenda',
  loadError: 'No pudimos cargar «Pendiente de cerrar».',
  refreshError: 'No pudimos actualizar «Pendiente de cerrar».',
  empty: 'Todo cerrado',
  emptyHint: 'No queda ninguna cita de días anteriores sin desenlace, sin evolución ni con tratamiento sin marcar.',
  summaryLabel: 'Pendientes por sección',
  sectionEmpty: 'Nada pendiente en esta sección.',
  staleInClinic: (n: number) =>
    n === 1
      ? '1 cita de días anteriores sigue «en la clínica».'
      : `${n} citas de días anteriores siguen «en la clínica».`,
  staleInClinicLink: 'Ver «En clínica»',
  truncated: (shown: number, total: number) => `Se muestran las ${shown} más antiguas de ${total}.`,
  colPatient: 'Paciente',
  colWhen: 'Fecha y hora',
  colProfessional: 'Profesional',
  colLocation: 'Sede',
  colProcedure: 'Procedimiento',
  colActions: 'Acciones',
  noProfessional: 'Sin profesional',
  tooth: (n: string) => `diente ${n}`,
  attended: 'Atendida',
  noShow: 'No asistió',
  cancelled: 'Cancelada',
  writeEvolution: 'Escribir evolución',
  markDone: 'Marcar hecho',
  dismiss: 'Descartar',
  actionsLabel: (patient: string) => `Acciones para ${patient}`,
  statusSaved: (patient: string, label: string) => `${patient}: ${label}.`,
  statusError: 'No pudimos cambiar el estado de la cita.',
  evolutionSaved: (patient: string) => `Evolución registrada en la ficha de ${patient}.`,
  itemError: 'No pudimos abrir el procedimiento del plan.',
  itemDone: (patient: string) => `Procedimiento de ${patient} marcado como realizado.`,
  dismissed: 'Pendiente descartado.',
  alreadyClosed: 'Ese pendiente ya estaba cerrado o descartado: la lista se actualizó.',
  withoutZone: (names: string) =>
    `Sin zona horaria configurada: ${names}. Sus citas no aparecen aquí hasta configurarla en Ajustes → Sedes.`,
};

const copy = closingQueueCopy;

const SECTION_IDS: Record<ClosingQueueSection, string> = {
  OUTCOME: 'cierre-desenlace',
  EVOLUTION: 'cierre-evolucion',
  TREATMENT: 'cierre-tratamiento',
};

type Dismissing = {
  section: ClosingQueueSection;
  appointmentId: string;
  planItemId?: string;
  subject: string;
};

type Cancelling = { appointmentId: string; patientName: string; status: AppointmentStatus };
type MarkingDone = { planId: string; item: TreatmentPlanItem; row: ClosingTreatment };

/** Día y hora de la cita en la zona de SU sede, con el formato de la sede activa. */
function when(row: ClosingAppointment, fmt: RegionalFormat | null): string {
  return fmt ? fmt.dateTime(new Date(row.start), row.timeZone) : '—';
}

function sectionTotal(queue: ClosingQueue, section: ClosingQueueSection): number {
  const s = section === 'OUTCOME' ? queue.outcome : section === 'EVOLUTION' ? queue.evolution : queue.treatment;
  return s?.total ?? 0;
}

/**
 * «Pendiente de cerrar» (DX-439): las citas de días anteriores sin desenlace,
 * atendidas sin evolución o con tratamiento ligado sin marcar, con el contador
 * de cada sección y las acciones en línea. Cerrar usa los endpoints de
 * siempre (estado de la cita, evolución de la cita, ítem DONE); descartar pide
 * un motivo. La API decide qué secciones ve el rol y de qué sedes.
 */
export function ClosingQueueView({ token }: { token: string }) {
  const fmt = readyFormat(useSedeFormat(token));
  const subjectOf = (row: ClosingAppointment) => `${row.patientName} · ${when(row, fmt)}`;
  const [queue, setQueue] = useState<ClosingQueue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 403 (rol sin acceso por URL): no hay nada que reintentar.
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<Dismissing | null>(null);
  const [cancelling, setCancelling] = useState<Cancelling | null>(null);
  const [evolutionFor, setEvolutionFor] = useState<ClosingAppointment | null>(null);
  const [markingDone, setMarkingDone] = useState<MarkingDone | null>(null);
  const [locations, setLocations] = useState<ClinicLocation[]>([]);
  const [locationsKey, setLocationsKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getClosingQueue(token)
      .then((data) => {
        if (cancelled) return;
        setQueue(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setForbidden(err instanceof ApiError && err.status === 403);
        setError(apiErrorMessage(err, copy.loadError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  useEffect(() => {
    let cancelled = false;
    listLocations(token)
      .then((data) => {
        if (!cancelled) setLocations(data ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [token, locationsKey]);

  /**
   * Tras cerrar o descartar: relee la lista (el contenido sigue en pantalla si
   * falla), avisa al contador del menú y deja el foco en el encabezado de la
   * sección (o de la página si ya no queda nada), no en <body>.
   */
  const refresh = useCallback(
    (section?: ClosingQueueSection) => {
      notifyClosingQueueChanged();
      getClosingQueue(token)
        .then((data) => {
          setQueue(data);
          if (!section) return;
          requestAnimationFrame(() => {
            const heading =
              document.getElementById(`${SECTION_IDS[section]}-titulo`) ??
              document.querySelector<HTMLElement>('main h1');
            if (heading && !heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
            heading?.focus();
          });
        })
        .catch((err: unknown) =>
          notifyError(apiErrorMessage(err, copy.refreshError), {
            onRetry: () => setReloadKey((k) => k + 1),
          }),
        );
    },
    [token],
  );

  async function changeStatus(row: ClosingAppointment, status: AppointmentStatus, label: string) {
    setBusy(row.appointmentId);
    try {
      await updateAppointment(token, row.appointmentId, { status });
      toast.success(copy.statusSaved(row.patientName, label));
      refresh('OUTCOME');
    } catch (err) {
      notifyError(apiErrorMessage(err, copy.statusError), {
        onRetry: () => void changeStatus(row, status, label),
      });
    } finally {
      setBusy(null);
    }
  }

  async function openMarkDone(row: ClosingTreatment) {
    setBusy(row.planItemId);
    try {
      const plan = await getPlan(token, row.planId);
      const item = (plan.items ?? []).find((i) => i.id === row.planItemId);
      if (!item) {
        // Se retiró del plan mientras tanto: ya no es un pendiente.
        toast.info(copy.alreadyClosed);
        refresh('TREATMENT');
        return;
      }
      setMarkingDone({ planId: plan.id, item, row });
    } catch (err) {
      notifyError(apiErrorMessage(err, copy.itemError), { onRetry: () => void openMarkDone(row) });
    } finally {
      setBusy(null);
    }
  }

  const sections = queue?.sections ?? [];
  const isEmpty = queue !== null && queue.total === 0;
  const withoutZone = queue?.locationsWithoutZone ?? [];

  return (
    <div className="flex flex-col">
      <PageHeader
        title={copy.title}
        description={copy.description}
        back={{ href: '/agenda', label: copy.back }}
      />
      {queue && queue.staleInClinic ? (
        <p role="note" className="mb-4 text-sm text-muted">
          {copy.staleInClinic(queue.staleInClinic)}{' '}
          <Link
            href="/agenda/en-clinica"
            className="font-medium text-primary-text underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-text"
          >
            {copy.staleInClinicLink}
          </Link>
        </p>
      ) : null}
      {withoutZone.length > 0 ? (
        <p role="note" className="mb-4 text-sm text-warning-text">
          {copy.withoutZone(withoutZone.map((l) => l.name).join(', '))}
        </p>
      ) : null}
      <AsyncSection
        loading={loading}
        error={error}
        onRetry={
          forbidden
            ? undefined
            : () => {
                setLoading(true);
                setReloadKey((k) => k + 1);
              }
        }
        isEmpty={isEmpty}
        emptyTitle={copy.empty}
        emptyDescription={copy.emptyHint}
        emptyIcon={<CheckCheck aria-hidden />}
        skeleton={<TableSkeleton rows={4} />}
      >
        {queue ? (
          <div className="flex flex-col gap-8">
            <nav aria-label={copy.summaryLabel}>
              <ul className="flex flex-wrap gap-2">
                {sections.map((s) => (
                  <li key={s}>
                    <a
                      href={`#${SECTION_IDS[s]}`}
                      onClick={(e) => {
                        // El foco va a la sección, no solo el scroll.
                        const heading = document.getElementById(`${SECTION_IDS[s]}-titulo`);
                        if (!heading) return;
                        e.preventDefault();
                        heading.scrollIntoView({ block: 'start' });
                        heading.focus();
                      }}
                      className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-ink hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-text sm:min-h-9"
                    >
                      {CLOSING_SECTION_TITLES[s]}
                      <span
                        data-testid={`closing-count-${s}`}
                        className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-semibold tabular-nums text-ink"
                      >
                        {sectionTotal(queue, s)}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            {queue.outcome ? (
              <QueueSection section="OUTCOME" total={queue.outcome.total} shown={queue.outcome.items.length}>
                <AppointmentTable
                  fmt={fmt}
                  rows={queue.outcome.items}
                  section="OUTCOME"
                  actions={(row) => (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="min-h-11 sm:min-h-9"
                        disabled={busy === row.appointmentId}
                        onClick={() => void changeStatus(row, 'COMPLETED', copy.attended)}
                      >
                        {copy.attended}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="min-h-11 sm:min-h-9"
                        disabled={busy === row.appointmentId}
                        onClick={() => void changeStatus(row, 'NO_SHOW', copy.noShow)}
                      >
                        {copy.noShow}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="min-h-11 sm:min-h-9"
                        disabled={busy === row.appointmentId}
                        onClick={() =>
                          setCancelling({
                            appointmentId: row.appointmentId,
                            patientName: row.patientName,
                            status: row.status,
                          })
                        }
                      >
                        {copy.cancelled}
                      </Button>
                      <DismissButton
                        disabled={busy === row.appointmentId}
                        onClick={() =>
                          setDismissing({ section: 'OUTCOME', appointmentId: row.appointmentId, subject: subjectOf(row) })
                        }
                      />
                    </>
                  )}
                />
              </QueueSection>
            ) : null}

            {queue.evolution ? (
              <QueueSection section="EVOLUTION" total={queue.evolution.total} shown={queue.evolution.items.length}>
                <AppointmentTable
                  fmt={fmt}
                  rows={queue.evolution.items}
                  section="EVOLUTION"
                  actions={(row) => (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="min-h-11 sm:min-h-9"
                        onClick={() => setEvolutionFor(row)}
                      >
                        {copy.writeEvolution}
                      </Button>
                      <DismissButton
                        onClick={() =>
                          setDismissing({ section: 'EVOLUTION', appointmentId: row.appointmentId, subject: subjectOf(row) })
                        }
                      />
                    </>
                  )}
                />
              </QueueSection>
            ) : null}

            {queue.treatment ? (
              <QueueSection section="TREATMENT" total={queue.treatment.total} shown={queue.treatment.items.length}>
                <AppointmentTable
                  fmt={fmt}
                  rows={queue.treatment.items}
                  section="TREATMENT"
                  rowKey={(row) => `${row.appointmentId}-${row.planItemId}`}
                  procedure={(row) => `${row.procedureLabel} · ${copy.tooth(row.toothNumber)}`}
                  actions={(row) => (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="min-h-11 sm:min-h-9"
                        disabled={busy === row.planItemId}
                        onClick={() => void openMarkDone(row)}
                      >
                        {copy.markDone}
                      </Button>
                      <DismissButton
                        disabled={busy === row.planItemId}
                        onClick={() =>
                          setDismissing({
                            section: 'TREATMENT',
                            appointmentId: row.appointmentId,
                            planItemId: row.planItemId,
                            subject: `${subjectOf(row)} · ${row.procedureLabel} · ${copy.tooth(row.toothNumber)}`,
                          })
                        }
                      />
                    </>
                  )}
                />
              </QueueSection>
            ) : null}
          </div>
        ) : null}
      </AsyncSection>

      {dismissing ? (
        <DismissClosingDialog
          key={`${dismissing.section}-${dismissing.appointmentId}-${dismissing.planItemId ?? ''}`}
          open
          onOpenChange={(open) => {
            if (!open) setDismissing(null);
          }}
          token={token}
          section={dismissing.section}
          appointmentId={dismissing.appointmentId}
          planItemId={dismissing.planItemId}
          subject={dismissing.subject}
          onDone={() => {
            const section = dismissing.section;
            setDismissing(null);
            toast.success(copy.dismissed);
            refresh(section);
          }}
          onStale={() => {
            const section = dismissing.section;
            setDismissing(null);
            toast.info(copy.alreadyClosed);
            refresh(section);
          }}
        />
      ) : null}

      {cancelling ? (
        <CancelAppointmentDialog
          key={cancelling.appointmentId}
          open
          onOpenChange={(open) => {
            if (!open) setCancelling(null);
          }}
          token={token}
          appointmentId={cancelling.appointmentId}
          patientName={cancelling.patientName}
          fromStatus={cancelling.status}
          onDone={() => {
            setCancelling(null);
            toast.success(copy.statusSaved(cancelling.patientName, copy.cancelled));
            refresh('OUTCOME');
          }}
        />
      ) : null}

      {evolutionFor ? (
        <NewEvolutionModal
          key={evolutionFor.appointmentId}
          open
          onOpenChange={(open) => {
            if (!open) setEvolutionFor(null);
          }}
          token={token}
          patientId={evolutionFor.patientId}
          appointment={{
            id: evolutionFor.appointmentId,
            start: evolutionFor.start,
            providerName: evolutionFor.professionalName,
          }}
          onCreated={() => {
            toast.success(copy.evolutionSaved(evolutionFor.patientName));
            setEvolutionFor(null);
            refresh('EVOLUTION');
          }}
        />
      ) : null}

      {markingDone ? (
        <MarkDoneModal
          key={markingDone.item.id}
          open
          onOpenChange={(open) => {
            if (!open) setMarkingDone(null);
          }}
          token={token}
          planId={markingDone.planId}
          item={markingDone.item}
          subject={`${markingDone.row.procedureLabel} · ${copy.tooth(markingDone.row.toothNumber)}`}
          mode="done"
          // La sede, la fecha y quién: los de la cita atendida (la API toma
          // sede y fecha de `appointmentId`), no la sede activa ni hoy.
          activeLocationId={markingDone.row.locationId}
          locationName={markingDone.row.locationName}
          locations={locations}
          onRetryLocations={() => setLocationsKey((k) => k + 1)}
          appointmentId={markingDone.row.appointmentId}
          preferredPerformerId={markingDone.row.professionalId}
          onSaved={() => {
            toast.success(copy.itemDone(markingDone.row.patientName));
            setMarkingDone(null);
            refresh('TREATMENT');
          }}
        />
      ) : null}
    </div>
  );
}

function DismissButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button size="sm" variant="ghost" className="min-h-11 sm:min-h-9" disabled={disabled} onClick={onClick}>
      {copy.dismiss}
    </Button>
  );
}

function QueueSection({
  section,
  total,
  shown,
  children,
}: {
  section: ClosingQueueSection;
  total: number;
  shown: number;
  children: React.ReactNode;
}) {
  const headingId = `${SECTION_IDS[section]}-titulo`;
  return (
    <section id={SECTION_IDS[section]} aria-labelledby={headingId} className="flex scroll-mt-4 flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2
          id={headingId}
          tabIndex={-1}
          className="flex items-center gap-2 text-lg font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-text"
        >
          {CLOSING_SECTION_TITLES[section]}
          <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-semibold tabular-nums text-ink">
            {total}
          </span>
        </h2>
        <p className="text-sm text-muted">{CLOSING_SECTION_HINTS[section]}</p>
      </div>
      {total === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted">
          {copy.sectionEmpty}
        </p>
      ) : (
        <>
          {children}
          {shown < total ? <p className="text-xs text-muted">{copy.truncated(shown, total)}</p> : null}
        </>
      )}
    </section>
  );
}

function AppointmentTable<T extends ClosingAppointment>({
  fmt,
  rows,
  section,
  actions,
  procedure,
  rowKey = (row) => row.appointmentId,
}: {
  fmt: RegionalFormat | null;
  rows: T[];
  section: ClosingQueueSection;
  actions: (row: T) => React.ReactNode;
  procedure?: (row: T) => string;
  rowKey?: (row: T) => string;
}) {
  return (
    <Table aria-label={CLOSING_SECTION_TITLES[section]}>
      <TableHeader>
        <TableRow>
          <TableHead>{copy.colPatient}</TableHead>
          <TableHead>{copy.colWhen}</TableHead>
          <TableHead>{copy.colProfessional}</TableHead>
          <TableHead>{copy.colLocation}</TableHead>
          {procedure ? <TableHead>{copy.colProcedure}</TableHead> : null}
          <TableHead className="text-right">{copy.colActions}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={rowKey(row)} data-testid={`closing-row-${section}`}>
            <TableCell data-label={copy.colPatient} className="font-medium text-ink">
              <Link
                href={`/patients/${row.patientId}`}
                className="inline-flex min-h-6 items-center underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-text"
              >
                {row.patientName}
              </Link>
            </TableCell>
            <TableCell data-label={copy.colWhen} className="tabular-nums">
              {when(row, fmt)}
            </TableCell>
            <TableCell data-label={copy.colProfessional}>{row.professionalName ?? copy.noProfessional}</TableCell>
            <TableCell data-label={copy.colLocation}>{row.locationName}</TableCell>
            {procedure ? <TableCell data-label={copy.colProcedure}>{procedure(row)}</TableCell> : null}
            <TableCell data-label={copy.colActions} className="sm:text-right">
              <div
                role="group"
                aria-label={copy.actionsLabel(row.patientName)}
                className="flex flex-wrap gap-2 sm:justify-end"
              >
                {actions(row)}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
