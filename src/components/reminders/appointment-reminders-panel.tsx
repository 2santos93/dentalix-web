'use client';
import { useEffect, useId, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { NO_SEDE_FORMAT } from '@/lib/format/sede-number';
import type { SedeClock } from '@/lib/locations/sede-clock';
import {
  getAppointmentReminders,
  leadHoursLabel,
  PATIENT_BLOCKER_LABELS,
  SKIP_REASON_LABELS,
  type AppointmentReminderItem,
  type AppointmentReminders,
} from '@/lib/reminders/reminders-api';
import { SectionError } from '@/components/errors/section-error';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

const copy = {
  heading: 'Recordatorios por email',
  loading: 'Cargando recordatorios',
  loadError: 'No pudimos cargar los recordatorios de la cita.',
  disabled: 'La sede de esta cita no tiene recordatorios automáticos.',
  none: 'Esta cita no tiene recordatorios por salir.',
  listLabel: 'Recordatorios de la cita',
  sent: (at: string) => `Enviado ${at}`,
  pending: 'Pendiente',
  pendingAt: (at: string) => `sale el ${at}`,
  sending: 'Enviándose',
  failed: 'Falló el envío',
  failedHint: 'El recordatorio no pudo enviarse tras agotar los intentos.',
  skipped: (reason: string) => `Omitido: ${reason}`,
  missed: 'No enviado',
  missedHint: 'La cita se agendó después de esa hora.',
  previous: 'Para la hora anterior de la cita',
  // DX-203: un menor o un paciente sin email lo recibe su responsable.
  toResponsible: 'Recordatorio enviado al responsable',
  delivery: {
    PENDING: 'Entregándose al correo del paciente',
    SENT: 'Entregado al proveedor de correo',
    FAILED: 'El proveedor de correo no pudo entregarlo',
  },
};

/** Día, mes y hora con el reloj de la sede de la cita, como la agenda (DX-378); «—» sin él. */
function shortDateTime(iso: string | null, clock: SedeClock | null): string {
  if (!iso) return '';
  if (!clock) return NO_SEDE_FORMAT;
  const instant = new Date(iso);
  return `${clock.fmt.dayMonth(instant, clock.timeZone)} ${clock.fmt.time(instant, clock.timeZone)}`;
}

const BADGE: Record<AppointmentReminderItem['state'], BadgeProps['variant']> = {
  SENT: 'success',
  FAILED: 'danger',
  PENDING: 'muted',
  SENDING: 'muted',
  SKIPPED: 'warning',
  MISSED: 'muted',
};

function stateLabel(item: AppointmentReminderItem, clock: SedeClock | null): string {
  switch (item.state) {
    case 'FAILED':
      return copy.failed;
    case 'SENT':
      return copy.sent(shortDateTime(item.sentAt, clock));
    case 'PENDING':
      return copy.pending;
    case 'SENDING':
      return copy.sending;
    case 'SKIPPED':
      return copy.skipped(item.skipReason ? SKIP_REASON_LABELS[item.skipReason] : '—');
    case 'MISSED':
      return copy.missed;
  }
}

function detail(item: AppointmentReminderItem, clock: SedeClock | null): string | null {
  if (item.state === 'FAILED') return copy.failedHint;
  if (item.state === 'PENDING') return copy.pendingAt(shortDateTime(item.dueAt, clock));
  if (item.state === 'MISSED') return copy.missedHint;
  if (item.state === 'SENT' && item.emailDelivery) return copy.delivery[item.emailDelivery];
  return null;
}

interface AppointmentRemindersPanelProps {
  token: string;
  appointmentId: string;
  /** DX-378: reloj de la sede de la cita. */
  clock: SedeClock | null;
}

/**
 * Bloque del detalle de la cita (DX-026): qué recordatorios automáticos salieron,
 * cuáles faltan y por qué se omitió alguno («Enviado 14/10 09:00 · 2 días
 * antes», «Pendiente · 2 h antes», «Omitido: sin email»). El padre lo monta
 * con una `key` por cita, hora y estado: así se relee tras reprogramarla o
 * cancelarla.
 */
export function AppointmentRemindersPanel({ token, appointmentId, clock }: AppointmentRemindersPanelProps) {
  const ids = useId();
  const [data, setData] = useState<AppointmentReminders | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getAppointmentReminders(token, appointmentId)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(apiErrorMessage(err, copy.loadError));
      });
    return () => {
      cancelled = true;
    };
  }, [token, appointmentId, reloadKey]);

  function body() {
    if (error) {
      return (
        <SectionError
          description={error}
          onRetry={() => {
            setError(null);
            setData(null);
            setReloadKey((k) => k + 1);
          }}
          className="py-6"
        />
      );
    }
    if (!data) {
      return (
        <div role="status" aria-label={copy.loading} className="flex flex-col gap-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
        </div>
      );
    }
    // DX-128: con baja o con otro canal no queda nada por salir por email.
    const blocker = data.patientBlocker ? PATIENT_BLOCKER_LABELS[data.patientBlocker] : null;
    if (data.items.length === 0) {
      return (
        <p role="status" className="text-sm text-muted">
          {data.enabled ? (blocker ?? copy.none) : copy.disabled}
        </p>
      );
    }
    return (
      <>
        <ul aria-label={copy.listLabel} className="flex flex-col divide-y divide-hairline">
          {data.items.map((item) => {
            const extra = detail(item, clock);
            return (
              <li
                key={`${item.appointmentStart}-${item.leadHours}`}
                className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0"
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Badge variant={item.emailDelivery === 'FAILED' ? 'danger' : BADGE[item.state]}>
                    {stateLabel(item, clock)}
                  </Badge>
                  <span className="text-sm tabular-nums text-ink">{leadHoursLabel(item.leadHours)}</span>
                </div>
                {item.state === 'SENT' && item.sentToResponsible && (
                  <p className="text-xs text-ink">{copy.toResponsible}</p>
                )}
                {extra && <p className="text-xs tabular-nums text-muted">{extra}</p>}
                {!item.current && <p className="text-xs text-muted">{copy.previous}</p>}
              </li>
            );
          })}
        </ul>
        {blocker && <p className="text-xs text-muted">{blocker}</p>}
      </>
    );
  }

  return (
    <section aria-labelledby={`${ids}-heading`} className="flex flex-col gap-3 border-t border-hairline pt-4">
      <h3 id={`${ids}-heading`} className="text-sm font-semibold text-ink">
        {copy.heading}
      </h3>
      {body()}
    </section>
  );
}
