'use client';
import { useEffect, useId, useState } from 'react';
import { Plus, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Badge } from '@/components/ui/badge';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { StatusBadge } from '@/components/ui/status-badge';
import { SectionError } from '@/components/errors/section-error';
import { locationClock, sedeTimeRange, type SedeClock } from '@/lib/locations/sede-clock';
import { sedeToday } from '@/lib/locations/use-sede-time-zone';
import { getActiveLocationId } from '@/lib/locations/location-store';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { telHref } from '@/lib/receivables/presentation';
import { offlineOwnerOf, readOfflineAgenda, type OfflineAgenda, type OfflineAgendaAppointment } from '@/lib/offline/offline-agenda';

export const offlineAgendaCopy = {
  notice: (time: string) => `Sin conexión · datos de las ${time}`,
  noticeOtherDay: (date: string, time: string) => `Sin conexión · datos del ${date} a las ${time}`,
  body: (sede: string) =>
    `Estás viendo la copia de la agenda de hoy y mañana de ${sede} guardada en este equipo. Al volver la conexión la agenda se actualiza sola.`,
  readOnly: 'Sin conexión no se pueden crear ni editar citas: la agenda es de solo lectura hasta que vuelva la conexión.',
  newAppointment: 'Nueva cita',
  today: 'Hoy',
  tomorrow: 'Mañana',
  dayEmpty: 'Sin citas este día.',
  listLabel: (day: string) => `Citas · ${day}`,
  colTime: 'Hora',
  colChair: 'Gabinete',
  colProfessional: 'Profesional',
  colPatient: 'Paciente',
  colPhone: 'Teléfono',
  colType: 'Tipo',
  colStatus: 'Confirmación',
  noChair: 'Sin gabinete',
  noProfessional: 'Sin asignar',
  noPhone: 'Sin teléfono',
  noType: 'Sin tipo',
  medicalAlert: 'Alerta médica: sí',
  callLabel: (name: string, phone: string) => `Llamar a ${name} · ${phone}`,
  missingTitle: 'Sin conexión',
  missingBody:
    'No hay una copia de la agenda guardada en este equipo (o ya caducó: se guarda 48 horas). Cuando vuelva la conexión, la agenda se carga sola.',
  retry: 'Comprobar de nuevo',
  loading: 'Abriendo la copia guardada…',
};

type Loaded =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'ready'; agenda: OfflineAgenda; savedAt: number; clock: SedeClock };

/**
 * La agenda SIN CONEXIÓN (DX-405): la copia cifrada de hoy y mañana de la sede
 * que se guardó mientras había red, en solo lectura. Nada de notas clínicas:
 * la alerta médica es un «sí» sin detalle. Crear y editar no están: el botón
 * «Nueva cita» se queda a la vista, inactivo, con el motivo enlazado.
 */
export function OfflineAgendaView({ token }: { token: string | null }) {
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const readOnlyId = useId();

  useEffect(() => {
    let cancelled = false;
    void readOfflineAgenda({ owner: offlineOwnerOf(token)?.owner ?? null, activeLocationId: getActiveLocationId() }).then(
      (stored) => {
        if (cancelled) return;
        const clock = stored
          ? locationClock({
              timeZone: stored.payload.timeZone,
              locale: stored.payload.locale,
              hourCycle: stored.payload.hourCycle as ClinicLocation['hourCycle'],
            })
          : null;
        setLoaded(
          stored && clock
            ? { status: 'ready', agenda: stored.payload, savedAt: stored.savedAt, clock }
            : { status: 'missing' },
        );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [token, attempt]);

  if (loaded.status === 'loading') {
    return (
      <p role="status" className="text-sm text-muted">
        {offlineAgendaCopy.loading}
      </p>
    );
  }
  if (loaded.status === 'missing') {
    return (
      <SectionError
        title={offlineAgendaCopy.missingTitle}
        description={offlineAgendaCopy.missingBody}
        onRetry={() => setAttempt((n) => n + 1)}
        retryLabel={offlineAgendaCopy.retry}
      />
    );
  }

  const { agenda, clock } = loaded;
  const generatedAt = new Date(agenda.generatedAt);
  const today = sedeToday(clock.timeZone);
  const generatedDay = sedeToday(clock.timeZone, generatedAt);
  const time = clock.fmt.time(generatedAt, clock.timeZone);
  const notice =
    generatedDay === today
      ? offlineAgendaCopy.notice(time)
      : offlineAgendaCopy.noticeOtherDay(clock.fmt.civilDate(generatedDay), time);
  // Pasada la medianoche, «hoy» de la copia ya es ayer: no se enseña.
  const days = agenda.days.filter((day) => day >= today);

  return (
    <div data-testid="offline-agenda" className="flex flex-col gap-6">
      <Callout tone="warning" icon={WifiOff} title={notice} data-testid="offline-notice">
        <p>{offlineAgendaCopy.body(agenda.locationName)}</p>
      </Callout>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <p id={readOnlyId} className="text-sm text-muted sm:mr-auto">
          {offlineAgendaCopy.readOnly}
        </p>
        <Button
          type="button"
          aria-disabled="true"
          aria-describedby={readOnlyId}
          className="cursor-not-allowed opacity-60 max-sm:w-full"
          onClick={(e) => e.preventDefault()}
        >
          <Plus aria-hidden /> {offlineAgendaCopy.newAppointment}
        </Button>
      </div>

      {days.map((day) => (
        <OfflineDay
          key={day}
          day={day}
          label={dayLabel(day, today, agenda.days, clock)}
          rows={agenda.appointments.filter((a) => sedeToday(clock.timeZone, new Date(a.start)) === day)}
          clock={clock}
        />
      ))}
    </div>
  );
}

function dayLabel(day: string, today: string, days: readonly string[], clock: SedeClock): string {
  const long = clock.fmt.civilLongDate(day, { weekday: true, year: false });
  if (day === today) return `${offlineAgendaCopy.today} · ${long}`;
  if (day === days[1] && days[0] === today) return `${offlineAgendaCopy.tomorrow} · ${long}`;
  return long;
}

function OfflineDay({
  day,
  label,
  rows,
  clock,
}: {
  day: string;
  label: string;
  rows: OfflineAgendaAppointment[];
  clock: SedeClock;
}) {
  const headingId = `offline-day-${day}`;
  const columns: DataListColumn<OfflineAgendaAppointment>[] = [
    {
      id: 'time',
      header: offlineAgendaCopy.colTime,
      mobile: 'trailing',
      cell: (a) => <span className="whitespace-nowrap tabular-nums">{sedeTimeRange(a.start, a.end, clock)}</span>,
    },
    {
      id: 'patient',
      header: offlineAgendaCopy.colPatient,
      mobile: 'primary',
      cell: (a) => (
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-ink">{a.patientName}</span>
          {a.medicalAlert ? (
            <Badge variant="danger" dot>
              {offlineAgendaCopy.medicalAlert}
            </Badge>
          ) : null}
        </span>
      ),
    },
    {
      id: 'phone',
      header: offlineAgendaCopy.colPhone,
      cell: (a) =>
        a.phone ? (
          <a
            href={telHref(a.phone)}
            className="whitespace-nowrap tabular-nums text-primary-text underline-offset-2 hover:underline"
            aria-label={offlineAgendaCopy.callLabel(a.patientName, a.phone)}
          >
            {a.phone}
          </a>
        ) : (
          <span className="text-muted">{offlineAgendaCopy.noPhone}</span>
        ),
      mobileCell: (a) => a.phone,
    },
    {
      id: 'chair',
      header: offlineAgendaCopy.colChair,
      cell: (a) => a.chairName ?? <span className="text-muted">{offlineAgendaCopy.noChair}</span>,
      mobileCell: (a) => a.chairName,
    },
    {
      id: 'professional',
      header: offlineAgendaCopy.colProfessional,
      cell: (a) => a.professionalName ?? <span className="text-muted">{offlineAgendaCopy.noProfessional}</span>,
      mobileCell: (a) => a.professionalName,
    },
    {
      id: 'type',
      header: offlineAgendaCopy.colType,
      showFrom: 'lg',
      cell: (a) => a.appointmentTypeName ?? <span className="text-muted">{offlineAgendaCopy.noType}</span>,
      mobileCell: (a) => a.appointmentTypeName,
    },
    {
      id: 'status',
      header: offlineAgendaCopy.colStatus,
      cell: (a) => <StatusBadge kind="appointment" status={a.status} />,
      mobileCell: (a) => <StatusBadge kind="appointment" status={a.status} />,
    },
  ];

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="t-title text-ink">
        {label}
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{offlineAgendaCopy.dayEmpty}</p>
      ) : (
        <DataList
          label={offlineAgendaCopy.listLabel(label)}
          rows={rows}
          columns={columns}
          getRowKey={(a) => a.id}
          getRowLabel={(a) => a.patientName}
        />
      )}
    </section>
  );
}
