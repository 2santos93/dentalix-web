'use client';
import { Phone, Send, Calendar, CircleCheck, CheckCheck, CircleX, CircleMinus, Clock, Armchair, Wallet } from 'lucide-react';
import type { Appointment, AppointmentStatus } from '@/lib/appointments/appointments-api';
import {
  confirmationIndicator,
  type ConfirmationIndicator,
} from '@/lib/appointments/confirmation-message';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { statusLabels, statusTone, statusTones, TONE_CLASSES } from '@/lib/status/tones';

/** Etiquetas de estado de cita — del mapa único `@/lib/status/tones`; las comparten agenda, selects y textos. */
export const STATUS_LABELS: Record<AppointmentStatus, string> = statusLabels('appointment');

/** Formas distintas para reconocer los estados también sin matiz. */
const STATUS_ICONS = {
  SCHEDULED: Calendar, CONFIRMED: CircleCheck, COMPLETED: CheckCheck,
  CANCELLED: CircleX, NO_SHOW: CircleMinus, ARRIVED: Clock,
  IN_CHAIR: Armchair, READY_FOR_CHECKOUT: Wallet,
} satisfies Record<AppointmentStatus, typeof Calendar>;
export const STATUS_SHORT_LABELS: Record<AppointmentStatus, string> = {
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

/**
 * Fondo y borde del bloque/chip de la cita por estado, derivados del tono del
 * mapa único (`@/lib/status/tones`): nunca el acento de la clínica. Texto en
 * tinta para conservar el contraste sobre el tinte.
 */
export const STATUS_BADGE_CLASSES = Object.fromEntries(
  Object.entries(statusTones('appointment')).map(([status, tone]) => [
    status,
    `${TONE_CLASSES[tone].border} ${TONE_CLASSES[tone].subtle} text-ink`,
  ]),
) as Record<AppointmentStatus, string>;

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

/**
 * Nombre corto para los chips del Mes: primer nombre + inicial del primer
 * apellido («Laura C.»). En una celda de ~110 px el nombre completo se
 * truncaba a dos letras («Is…»); el corto se lee entero. El nombre completo
 * sigue en el detalle, en la lista del día y en el nombre accesible.
 */
export function patientShortLabel(appointment: Appointment, patientNames?: Record<string, string>): string {
  const first = appointment.patientFirstName?.trim().split(/\s+/)[0];
  const last = appointment.patientLastName?.trim();
  if (first) return last ? `${first} ${last.charAt(0).toLocaleUpperCase('es')}.` : first;
  return patientLabel(appointment, patientNames);
}

/** Chip de estado de la cita (solo lectura) — agenda del día y de la semana. */
export function StatusBadge({ status }: { status: AppointmentStatus }) {
  return (
    <Badge variant={statusTone('appointment', status)} data-testid="appointment-status-badge">
      <AppointmentStatusLabel status={status} />
    </Badge>
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
  if (compact) {
    return (
      <span
        data-testid="appointment-confirmation-indicator"
        data-indicator={indicator}
        title={label}
        className={cn('inline-flex items-center', indicator === 'callback' ? 'text-warning-text' : 'text-muted', className)}
      >
        <Icon aria-hidden className="size-3" />
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  return (
    <Badge
      variant={indicator === 'callback' ? 'warning' : 'neutral'}
      data-testid="appointment-confirmation-indicator"
      data-indicator={indicator}
      className={className}
    >
      <Icon aria-hidden className="size-3" />
      {label}
    </Badge>
  );
}
