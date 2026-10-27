import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { locationRegionalFormat } from '@/lib/locations/location-settings';
import type { ClinicRole } from '@/lib/me/me-api';
import { NO_SEDE_FORMAT } from '@/lib/format/sede-number';

/**
 * DX-273 (revisión DX-271, I2): tratamientos de una cita que siguen
 * reservados en OTRA cita viva (la reserva se quedó allí al marcar «Llegó»),
 * y «Traer a esta cita». La API solo devuelve citas de sedes permitidas,
 * salvo la de hoy con el paciente en la clínica (`heldInClinic`), que llega
 * sin cita, hora ni sede (DX-293, DX-089).
 */
export type PlanItemReservedElsewhere = components['schemas']['PlanItemReservedElsewhereDto'];

/** La cita titular con su hora y su sede (sede permitida al usuario). */
type WithHolder = PlanItemReservedElsewhere & {
  locationId: string;
  start: string;
  timeZone: string;
  locationName: string;
};
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
  /** G1-B: la titular es de una sede permitida sin formato o sin reloj (su fecha y hora salen «—»). */
  missingFormat: 'Falta el formato regional o el reloj de esa sede: revísalo en Ajustes → Sedes.',
};

/** «30/10/2026 a las 09:00», en la zona, el formato y el reloj de la sede de ESA cita. */
export function reservedAt(item: { start: string; timeZone: string }, fmt: RegionalFormat): string {
  const start = new Date(item.start);
  return `${fmt.date(start, item.timeZone)} a las ${fmt.time(start, item.timeZone)}`;
}

/** «Implante · diente 36». */
export function reservedItemLabel(item: Pick<PlanItemReservedElsewhere, 'name' | 'toothNumber'>): string {
  return `${item.name} · diente ${item.toothNumber}`;
}

/**
 * La titular está a la vista: su sede está permitida al usuario. Solo mira la
 * cita y su sede, nunca el formato: una sede permitida sin formato o sin reloj
 * (por configurar) sigue siendo una titular con datos, no la de una sede no
 * permitida (I4).
 */
function hasHolder(item: PlanItemReservedElsewhere): item is WithHolder {
  return item.locationId !== null && item.start !== null && item.timeZone !== null && item.locationName !== null;
}

/** Formato y reloj de la sede de ESA cita, o `null` si no los tiene o no son válidos. */
function holderFormat(item: Pick<PlanItemReservedElsewhere, 'locale' | 'hourCycle'>): RegionalFormat | null {
  return locationRegionalFormat(item);
}

/**
 * La titular es de una sede permitida que no tiene formato o reloj: su fecha y
 * su hora se pintan «—» y quien muestra el aviso añade `SedeConfigError
 * kind="locale" variant="note"` (spec G1-B §11, I4).
 */
export function reservedNeedsFormat(item: PlanItemReservedElsewhere): boolean {
  return hasHolder(item) && holderFormat(item) === null;
}

/**
 * «Este tratamiento está reservado en la cita del 30/10/2026 a las 09:00
 * (Sede Norte).» DX-293: con la titular de hoy con el paciente en la clínica,
 * «Reservado en la cita de hoy a las 09:05 (Sede Norte), con el paciente en
 * la clínica.»; sin sus datos (sede no permitida), el texto genérico. Fecha y
 * hora con el formato y el reloj de la sede de ESA cita; si no los tiene, «—»
 * (nunca el texto de la sede no permitida ni otro formato).
 */
export function reservedElsewhereMessage(item: PlanItemReservedElsewhere): string {
  if (!hasHolder(item)) return reservationCopy.heldInClinicHidden;
  const fmt = holderFormat(item);
  if (item.heldInClinic) {
    const time = fmt ? fmt.time(new Date(item.start), item.timeZone) : NO_SEDE_FORMAT;
    return `Reservado en la cita de hoy a las ${time} (${item.locationName}), con el paciente en la clínica.`;
  }
  const at = fmt ? reservedAt(item, fmt) : NO_SEDE_FORMAT;
  return `Este tratamiento está reservado en la cita del ${at} (${item.locationName}).`;
}

/**
 * El aviso para un toast, que no tiene sitio para `SedeConfigError`: si la
 * titular es de una sede sin formato, añade por qué su fecha y hora salen «—».
 */
export function reservedElsewhereToast(item: PlanItemReservedElsewhere): string {
  const message = reservedElsewhereMessage(item);
  return reservedNeedsFormat(item) ? `${message} ${reservationCopy.missingFormat}` : message;
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
