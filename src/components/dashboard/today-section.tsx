'use client';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import type { ClinicRole } from '@/lib/me/me-api';
import { listAppointments, type ListAppointment } from '@/lib/appointments/appointments-api';
import { medicalAlertLines, ANAMNESIS_EXPIRED_LABEL, ANAMNESIS_MISSING_LABEL } from '@/lib/clinical/medical-alerts';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { NO_SEDE_FORMAT } from '@/lib/format/sede-number';
import { wallDayRange } from '@/lib/time/wall-clock';
import { SectionHeader } from '@/components/ui/section-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { SectionError } from '@/components/errors/section-error';
import { cn } from '@/lib/utils';
import { useLoad } from './use-load';

export const todayCopy = {
  heading: 'Hoy',
  headingMine: 'Tus pacientes de hoy',
  agendaLink: 'Abrir agenda',
  loading: 'Cargando las citas de hoy…',
  error: 'No pudimos cargar las citas de hoy.',
  emptyTitle: 'No hay citas hoy.',
  emptyTitleMine: 'No tienes citas hoy.',
  emptyDescription: (scope: string) => `Nada agendado para hoy en ${scope}.`,
  summaryLabel: 'Resumen de las citas de hoy',
  listLabel: 'Citas de hoy',
  total: 'Citas',
  toConfirm: 'Por confirmar',
  toConfirmHint: 'Agendadas que aún no confirman',
  confirmed: 'Confirmadas',
  inClinic: 'En la clínica',
  inClinicHint: 'En espera, en sillón o por cobrar',
  completed: 'Atendidas',
  noShow: 'No asistió',
  cancelled: (n: string, one: boolean) => (one ? `${n} cita cancelada hoy, fuera de la cuenta.` : `${n} citas canceladas hoy, fuera de la cuenta.`),
  showing: (shown: number, total: number) => `Se muestran ${shown} de ${total}.`,
  seeAll: (total: number) => `Ver las ${total} en la agenda`,
  criticalAlert: (n: number) => (n === 1 ? 'Alerta médica' : `${n} alertas médicas`),
  premedication: 'Premedicación',
  overdue: 'Saldo vencido',
  alertsOf: (lines: string[]) => `Alertas médicas: ${lines.join(', ')}.`,
};
const copy = todayCopy;

/** Cuántas filas caben en Inicio; el resto, en la agenda. */
export const TODAY_LIST_LIMIT = 10;

const IN_CLINIC = new Set<ListAppointment['status']>(['ARRIVED', 'IN_CHAIR', 'READY_FOR_CHECKOUT']);

export interface TodayCounts {
  total: number;
  toConfirm: number;
  confirmed: number;
  inClinic: number;
  completed: number;
  noShow: number;
  cancelled: number;
}

/**
 * El resumen del día a partir de las citas (I1). `total` no cuenta las
 * canceladas (se dicen aparte); «Por confirmar» son las agendadas que aún no
 * empezaron: una agendada ya pasada no se confirma, se cierra.
 */
export function countToday(appointments: readonly ListAppointment[], now: Date = new Date()): TodayCounts {
  const counts: TodayCounts = { total: 0, toConfirm: 0, confirmed: 0, inClinic: 0, completed: 0, noShow: 0, cancelled: 0 };
  for (const a of appointments) {
    if (a.status === 'CANCELLED') {
      counts.cancelled += 1;
      continue;
    }
    counts.total += 1;
    if (a.status === 'SCHEDULED' && new Date(a.start).getTime() > now.getTime()) counts.toConfirm += 1;
    if (a.status === 'CONFIRMED') counts.confirmed += 1;
    if (IN_CLINIC.has(a.status)) counts.inClinic += 1;
    if (a.status === 'COMPLETED') counts.completed += 1;
    if (a.status === 'NO_SHOW') counts.noShow += 1;
  }
  return counts;
}

export function TodaySection({
  token,
  role,
  userId,
  timeZone,
  today,
  scopeLabel,
  scopeKey,
  fmt,
  staffNames,
}: {
  token: string;
  role: ClinicRole;
  userId: string | null;
  timeZone: string;
  /** Hoy (`YYYY-MM-DD`) en la sede. */
  today: string;
  /** «Sede Norte» o «todas las sedes»: para el vacío. */
  scopeLabel: string;
  /** Cambia con la sede activa: vuelve a pedir. */
  scopeKey: string;
  fmt: RegionalFormat | null;
  staffNames: Record<string, string>;
}) {
  const mine = role === 'DENTIST';
  const range = wallDayRange(today, timeZone);
  const load = useLoad(
    () => listAppointments(token, { ...range, providerId: mine && userId ? userId : undefined }),
    `${today}|${timeZone}|${scopeKey}|${mine ? userId : 'all'}`,
    !mine || userId !== null,
    copy.error,
  );
  const heading = mine ? copy.headingMine : copy.heading;
  const dayLabel = fmt ? capitalize(fmt.civilLongDate(today, { year: false })) : today;

  return (
    <section aria-labelledby="inicio-today-title" className="flex flex-col gap-3">
      <SectionHeader
        titleId="inicio-today-title"
        title={heading}
        description={dayLabel}
        className="flex-row items-start justify-between"
        actions={
          <Link href="/agenda" className={sectionLinkClass}>
            {copy.agendaLink}
          </Link>
        }
      />
      {load.status === 'error' ? (
        <SectionError description={load.message} onRetry={load.reload} />
      ) : load.status !== 'ready' ? (
        <TodaySkeleton />
      ) : (
        <TodayBody
          appointments={load.data}
          mine={mine}
          scopeLabel={scopeLabel}
          timeZone={timeZone}
          fmt={fmt}
          staffNames={staffNames}
        />
      )}
    </section>
  );
}

function TodayBody({
  appointments,
  mine,
  scopeLabel,
  timeZone,
  fmt,
  staffNames,
}: {
  appointments: ListAppointment[];
  mine: boolean;
  scopeLabel: string;
  timeZone: string;
  fmt: RegionalFormat | null;
  staffNames: Record<string, string>;
}) {
  const counts = countToday(appointments);
  const n = (value: number) => (fmt ? fmt.number(value) : String(value));
  if (counts.total === 0 && counts.cancelled === 0) {
    return (
      <EmptyState
        role="status"
        title={mine ? copy.emptyTitleMine : copy.emptyTitle}
        description={copy.emptyDescription(scopeLabel)}
      />
    );
  }
  const visible = appointments
    .filter((a) => a.status !== 'CANCELLED')
    .sort((a, b) => a.start.localeCompare(b.start));
  const shown = visible.slice(0, TODAY_LIST_LIMIT);
  const figures: { key: keyof TodayCounts; label: string; hint?: string; tone?: string }[] = [
    { key: 'total', label: copy.total },
    { key: 'toConfirm', label: copy.toConfirm, hint: copy.toConfirmHint, tone: counts.toConfirm > 0 ? 'text-warning-text' : undefined },
    { key: 'confirmed', label: copy.confirmed },
    { key: 'inClinic', label: copy.inClinic, hint: copy.inClinicHint },
    { key: 'completed', label: copy.completed },
    { key: 'noShow', label: copy.noShow, tone: counts.noShow > 0 ? 'text-danger-text' : undefined },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <dl
        aria-label={copy.summaryLabel}
        className="grid grid-cols-3 border-b border-border-subtle sm:grid-cols-6 [&>div]:border-border-subtle max-sm:[&>div:nth-child(-n+3)]:border-b sm:[&>div+div]:border-l max-sm:[&>div:not(:nth-child(3n+1))]:border-l"
      >
        {figures.map((f) => (
          <div key={f.key} className="flex min-w-0 flex-col gap-0.5 px-4 py-3 sm:px-5" title={f.hint}>
            <dt className="t-overline truncate">{f.label}</dt>
            <dd className={cn('t-data text-xl font-semibold text-ink', f.tone)} data-testid={`today-${f.key}`}>
              {n(counts[f.key])}
            </dd>
          </div>
        ))}
      </dl>
      {shown.length > 0 ? (
        <ul aria-label={copy.listLabel} className="divide-y divide-border-subtle">
          {shown.map((a) => (
            <TodayRow
              key={a.id}
              appointment={a}
              showProvider={!mine}
              providerLabel={staffNames[a.providerId] ?? ''}
              time={fmt ? fmt.time(new Date(a.start), timeZone) : NO_SEDE_FORMAT}
            />
          ))}
        </ul>
      ) : null}
      {visible.length > shown.length || counts.cancelled > 0 ? (
        <div className="flex flex-col gap-1 border-t border-border-subtle px-4 py-2.5 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>
            {visible.length > shown.length ? `${copy.showing(shown.length, visible.length)} ` : ''}
            {counts.cancelled > 0 ? copy.cancelled(n(counts.cancelled), counts.cancelled === 1) : ''}
          </span>
          {visible.length > shown.length ? (
            <Link href="/agenda" className={sectionLinkClass}>
              {copy.seeAll(visible.length)}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function TodayRow({
  appointment,
  showProvider,
  providerLabel,
  time,
}: {
  appointment: ListAppointment;
  showProvider: boolean;
  providerLabel: string;
  time: string;
}) {
  const name =
    [appointment.patientFirstName, appointment.patientLastName].filter(Boolean).join(' ').trim() ||
    appointment.patientId;
  const flags = appointment.medicalAlerts;
  const alertLines = flags ? medicalAlertLines(flags) : [];
  const anamnesis =
    flags?.anamnesisStatus === 'MISSING'
      ? ANAMNESIS_MISSING_LABEL
      : flags?.anamnesisStatus === 'EXPIRED'
        ? ANAMNESIS_EXPIRED_LABEL
        : null;
  const overdue = appointment.balance?.hasOverdue === true;
  const hasFlags = alertLines.length > 0 || flags?.requiresPremedication || anamnesis || overdue;
  const muted = appointment.status === 'COMPLETED' || appointment.status === 'NO_SHOW';

  return (
    // Toda la fila abre la ficha: el enlace del nombre se estira sobre ella.
    // Las marcas no son interactivas, así que no compiten con el enlace.
    <li className="relative grid min-h-14 grid-cols-[3.75rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 px-4 py-2.5 hover:bg-canvas sm:grid-cols-[4.75rem_minmax(0,1fr)_auto] sm:px-6">
      <time dateTime={appointment.start} className={cn('t-data pt-px text-sm font-medium', muted ? 'text-muted' : 'text-ink')}>
        {time}
      </time>
      <div className="flex min-w-0 flex-col gap-1">
        <Link
          href={`/patients/${appointment.patientId}`}
          className="w-fit max-w-full truncate text-sm font-medium text-ink after:absolute after:inset-0 hover:underline focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-primary-text"
        >
          {name}
        </Link>
        {showProvider && providerLabel ? <span className="truncate text-sm text-muted">{providerLabel}</span> : null}
        {hasFlags ? (
          <span className="flex flex-wrap gap-1.5">
            {alertLines.length > 0 ? (
              <Badge variant="danger">
                <AlertTriangle aria-hidden className="size-3 shrink-0" />
                <span aria-hidden>{copy.criticalAlert(alertLines.length)}</span>
                <span className="sr-only">{copy.alertsOf(alertLines)}</span>
              </Badge>
            ) : null}
            {flags?.requiresPremedication ? <Badge variant="warning">{copy.premedication}</Badge> : null}
            {anamnesis ? <Badge variant="warning">{anamnesis}</Badge> : null}
            {overdue ? <Badge variant="warning">{copy.overdue}</Badge> : null}
          </span>
        ) : null}
      </div>
      <StatusBadge kind="appointment" status={appointment.status} className="justify-self-end whitespace-nowrap" />
    </li>
  );
}

function TodaySkeleton() {
  return (
    <div role="status" aria-label={copy.loading} className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="grid grid-cols-3 gap-4 border-b border-border-subtle p-4 sm:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
      <div className="flex flex-col gap-3 p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9" />
        ))}
      </div>
    </div>
  );
}

export const sectionLinkClass =
  'inline-flex items-center whitespace-nowrap rounded-sm text-sm font-medium text-primary-text hover:underline max-md:min-h-11';

export function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase('es') + text.slice(1);
}
