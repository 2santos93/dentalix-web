import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

/**
 * DX-273 (revisión DX-271, I2): tratamientos de una cita que siguen
 * reservados en OTRA cita viva (la reserva se quedó allí al marcar «Llegó»),
 * y «Traer a esta cita». La API solo devuelve citas de sedes permitidas,
 * salvo la de hoy con el paciente en la clínica (`heldInClinic`), que llega
 * sin cita, hora ni sede (DX-293, DX-089).
 */
export type PlanItemReservedElsewhere = components['schemas']['PlanItemReservedElsewhereDto'];

/** La cita titular con su hora y su sede (sede permitida al usuario). */
type WithHolder = PlanItemReservedElsewhere & { start: string; timeZone: string; locationName: string };
export type AppointmentWriteResult = components['schemas']['AppointmentWriteDto'];
export type CompletedExit = components['schemas']['CompletedExitDto'];

export const reservationCopy = {
  noticeTitle: 'Tratamiento reservado en otra cita',
  claim: 'Traer a esta cita',
  claimed: (name: string) => `${name} quedó reservado en esta cita.`,
  claimError: 'No pudimos traer el tratamiento a esta cita.',
  claimFromPanel: 'Puedes traerlo a esta cita desde «En clínica».',
  /** DX-293: la titular es de otra sede no permitida: sin hora ni sede. */
  heldInClinicHidden: 'Reservado en otra cita de hoy, con el paciente en la clínica.',
};

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Día y hora de la cita en la zona de la sede de ESA cita. */
function wallParts(item: { start: string; timeZone: string }): Record<string, string> {
  let f = formatters.get(item.timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('es-CO', {
      timeZone: item.timeZone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(item.timeZone, f);
  }
  return Object.fromEntries(f.formatToParts(new Date(item.start)).map((x) => [x.type, x.value]));
}

/** «30/10/2026 a las 09:00», en la zona de la sede de ESA cita. */
export function reservedAt(item: { start: string; timeZone: string }): string {
  const p = wallParts(item);
  return `${p.day}/${p.month}/${p.year} a las ${p.hour}:${p.minute}`;
}

/** «Implante · diente 36». */
export function reservedItemLabel(item: Pick<PlanItemReservedElsewhere, 'name' | 'toothNumber'>): string {
  return `${item.name} · diente ${item.toothNumber}`;
}

function hasHolder(item: PlanItemReservedElsewhere): item is WithHolder {
  return item.start !== null && item.timeZone !== null && item.locationName !== null;
}

/**
 * «Este tratamiento está reservado en la cita del 30/10/2026 a las 09:00
 * (Sede Norte).» DX-293: con la titular de hoy con el paciente en la clínica,
 * «Reservado en la cita de hoy a las 09:05 (Sede Norte), con el paciente en
 * la clínica.»; sin sus datos (sede no permitida), el texto genérico.
 */
export function reservedElsewhereMessage(item: PlanItemReservedElsewhere): string {
  if (!hasHolder(item)) return reservationCopy.heldInClinicHidden;
  if (item.heldInClinic) {
    const p = wallParts(item);
    return `Reservado en la cita de hoy a las ${p.hour}:${p.minute} (${item.locationName}), con el paciente en la clínica.`;
  }
  return `Este tratamiento está reservado en la cita del ${reservedAt(item)} (${item.locationName}).`;
}

/**
 * DX-293: «Traer a esta cita» solo si la API lo dejaría: no con la titular
 * de hoy con el paciente en la clínica (409 de DX-288) ni sin sus datos.
 */
export function canClaimReserved(item: PlanItemReservedElsewhere): boolean {
  return !item.heldInClinic && hasHolder(item);
}

/**
 * `POST /appointments/:id/plan-items/:planItemId/claim`: la cita (con el
 * paciente en la clínica) pasa a reservar el tratamiento y la otra lo deja.
 */
export function claimPlanItem(
  token: string,
  appointmentId: string,
  planItemId: string,
): Promise<AppointmentWriteResult> {
  return apiFetch<AppointmentWriteResult>(
    `/appointments/${appointmentId}/plan-items/${planItemId}/claim`,
    { method: 'POST', token },
  );
}

/**
 * DX-273: sacar una cita de «Completada» solo lo hacen el odontólogo y la
 * administración, con motivo (copia la regla de la API; el servidor decide).
 */
export const COMPLETED_EXIT_ROLES: readonly ClinicRole[] = ['ADMIN', 'DENTIST'];

export function canExitCompleted(role: ClinicRole | null): boolean {
  return role !== null && COMPLETED_EXIT_ROLES.includes(role);
}

export const STATUS_REASON_MIN = 3;
export const STATUS_REASON_MAX = 500;

/** ¿El motivo (recortado) tiene entre 3 y 500 caracteres? */
export function validStatusReason(reason: string): boolean {
  const n = reason.trim().length;
  return n >= STATUS_REASON_MIN && n <= STATUS_REASON_MAX;
}

/** `YYYY-MM-DD` → `dd/mm/aaaa`. */
function civilLabel(day: string): string {
  const [y, m, d] = day.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Qué pasó con el mínimo de la visita siguiente al sacar la cita de
 * «Completada»: una frase por visita afectada (vacío si no hay ninguna).
 */
export function completedExitSummary(exit: Pick<CompletedExit, 'visitMinimums'>): string[] {
  return exit.visitMinimums.map((v) => {
    const after = v.minimumDayAfter
      ? `desde el ${civilLabel(v.minimumDayAfter)} (última cita que sigue completada)`
      : 'desde hoy: ya no queda ninguna cita completada de la visita anterior';
    return `Visita ${v.visit}: ahora se puede agendar ${after}.`;
  });
}
