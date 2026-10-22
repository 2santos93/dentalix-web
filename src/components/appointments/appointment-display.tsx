'use client';
import { Phone, Send, Calendar, CircleCheck, CheckCheck, CircleX, CircleMinus, Clock, Armchair, Wallet } from 'lucide-react';
import type { Appointment, AppointmentStatus } from '@/lib/appointments/appointments-api';
import {
  confirmationIndicator,
  type ConfirmationIndicator,
} from '@/lib/appointments/confirmation-message';
import { formatTime } from '@/lib/format/date';
import { cn } from '@/lib/utils';

/** es status labels — shared by `DayAgenda` and `WeekAgenda` (and their status <select>s). */
export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  SCHEDULED: 'Agendada',
  CONFIRMED: 'Confirmada',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
  NO_SHOW: 'No asistió',
  // DX-200: el paciente en la clínica.
  ARRIVED: 'En espera',
  IN_CHAIR: 'En sillón',
  READY_FOR_CHECKOUT: 'Listo para cobrar',
};

/** Formas distintas para reconocer los estados también sin matiz. */
const STATUS_ICONS = {
  SCHEDULED: Calendar, CONFIRMED: CircleCheck, COMPLETED: CheckCheck,
  CANCELLED: CircleX, NO_SHOW: CircleMinus, ARRIVED: Clock,
  IN_CHAIR: Armchair, READY_FOR_CHECKOUT: Wallet,
} satisfies Record<AppointmentStatus, typeof Calendar>;
const STATUS_SHORT_LABELS: Record<AppointmentStatus, string> = {
  SCHEDULED: 'Agend.', CONFIRMED: 'Conf.', COMPLETED: 'Complet.',
  CANCELLED: 'Cancel.', NO_SHOW: 'No asist.', ARRIVED: 'Espera',
  IN_CHAIR: 'Sillón', READY_FOR_CHECKOUT: 'Cobrar',
};

export function AppointmentStatusLabel({ status, compact = false }: { status: AppointmentStatus; compact?: boolean }) {
  const Icon = STATUS_ICONS[status];
  return <span data-appointment-status={status} title={STATUS_LABELS[status]} className="inline-flex min-w-0 shrink-0 items-center gap-1">
    <Icon aria-hidden className="size-3 shrink-0" />
    <span>{compact ? STATUS_SHORT_LABELS[status] : STATUS_LABELS[status]}</span>
  </span>;
}

// Fondo/borde semánticos por estado; texto en tinta para conservar contraste
// también en los tintes claros. Nunca una utilidad de color literal
// (`bg-*-500`, `text-[#...]`). SCHEDULED/CONFIRMED use the neutral/brand
// tokens (nothing has happened yet / it's been acknowledged); COMPLETED maps
// to success, CANCELLED to danger, NO_SHOW to warning (attention-worthy but
// not an error).
export const STATUS_BADGE_CLASSES: Record<AppointmentStatus, string> = {
  SCHEDULED: 'border-muted bg-muted/10 text-ink',
  CONFIRMED: 'border-primary bg-primary/10 text-ink',
  COMPLETED: 'border-success bg-success/10 text-ink',
  CANCELLED: 'border-danger bg-danger/10 text-ink',
  NO_SHOW: 'border-warning bg-warning/10 text-ink',
  // DX-200: en la clínica. En espera, tinta (está aquí, nada clínico aún); en
  // el sillón, el acento; listo para cobrar, el éxito sin relleno (casi hecho).
  ARRIVED: 'border-ink/40 bg-surface-2 text-ink',
  IN_CHAIR: 'border-primary bg-primary/15 text-ink',
  READY_FOR_CHECKOUT: 'border-success bg-surface text-ink',
};

/** e.g. "09:00–09:30", 24h times in the user's local timezone. */
export function formatTimeRange(start: string, end: string): string {
  return `${formatTime(start)}–${formatTime(end)}`;
}

/**
 * Display name for an appointment's patient. Prefers the name the API joins
 * onto the appointment itself; falls back to an optional `patientId -> name`
 * map (kept for callers that still pass one), then to the raw id.
 *
 * The name used to come ONLY from that map, built via
 * `GET /patients?pageSize=100` — so any patient past the first 100 rendered
 * as a UUID. The joined fields make the label correct at any clinic size.
 */
export function patientLabel(
  appointment: Appointment,
  patientNames?: Record<string, string>,
): string {
  const joined = [appointment.patientFirstName, appointment.patientLastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  if (joined) return joined;
  return patientNames?.[appointment.patientId] ?? appointment.patientId;
}

/** Read-only colored status pill — shared by the day and week agenda views. */
export function StatusBadge({ status }: { status: AppointmentStatus }) {
  return (
    <span
      data-testid="appointment-status-badge"
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASSES[status]}`}
    >
      <AppointmentStatusLabel status={status} />
    </span>
  );
}

/** Textos del indicador de confirmación por enlace (DX-005). */
export const CONFIRMATION_INDICATOR_LABELS: Record<ConfirmationIndicator, string> = {
  pending: 'Confirmación pendiente',
  callback: 'Pide llamada',
};

/**
 * Indicador de la tarjeta de la cita: "Pide llamada" (el paciente pulsó
 * "Quiero que me llamen" — atención de recepción, tono warning) o
 * "Confirmación pendiente" (enlace enviado, sin respuesta — neutro). Nada si
 * no aplica (ver `confirmationIndicator`). `compact`: solo el icono, para los
 * bloques estrechos de la grilla semanal; el texto queda para lectores de
 * pantalla y como `title`.
 */
export function ConfirmationBadge({
  appointment,
  compact = false,
  className,
}: {
  appointment: Appointment;
  compact?: boolean;
  className?: string;
}) {
  const indicator = confirmationIndicator(appointment);
  if (!indicator) return null;
  const Icon = indicator === 'callback' ? Phone : Send;
  const label = CONFIRMATION_INDICATOR_LABELS[indicator];
  const tone =
    indicator === 'callback'
      ? 'border-warning bg-warning/10 text-warning'
      : 'border-border bg-surface-2 text-muted';
  if (compact) {
    return (
      <span
        data-testid="appointment-confirmation-indicator"
        data-indicator={indicator}
        title={label}
        className={cn('inline-flex items-center', indicator === 'callback' ? 'text-warning' : 'text-muted', className)}
      >
        <Icon aria-hidden className="size-3" />
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  return (
    <span
      data-testid="appointment-confirmation-indicator"
      data-indicator={indicator}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        tone,
        className,
      )}
    >
      <Icon aria-hidden className="size-3" />
      {label}
    </span>
  );
}
