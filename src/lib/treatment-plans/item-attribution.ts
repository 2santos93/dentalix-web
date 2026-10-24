import type { ClinicRole } from '@/lib/appointments/staff-api';
import type { TreatmentPlanItem } from '@/lib/treatment-plans/treatment-plans-api';
import { formatDate, zonedDayStart } from '@/lib/format/date';

/**
 * DX-050: quién puede figurar como quien realizó un procedimiento. Mismo
 * criterio que la API (`ATTENDING_ROLES`): odontología y administración.
 */
export function isAttendingRole(role: ClinicRole): boolean {
  return role === 'DENTIST' || role === 'ADMIN';
}

/**
 * ¿Atiende en la sede activa? Sin restricción (`null`, DX-089) en todas; sin
 * sede activa (vista consolidada) no se filtra: la API comprueba la que use.
 */
export function attendsAt(locationIds: string[] | null, activeLocationId: string | null): boolean {
  return activeLocationId === null || locationIds === null || locationIds.includes(activeLocationId);
}

/**
 * La línea de la ficha bajo un ítem realizado: «Realizado por Dra. X · fecha ·
 * sede», o «Sin atribuir» en los realizados de antes de DX-050. `null` si el
 * ítem no está realizado.
 */
export function attributionText(
  item: Pick<TreatmentPlanItem, 'status' | 'performedByName' | 'completedAt' | 'performedLocationName'>,
): string | null {
  if (item.status !== 'DONE') return null;
  if (!item.performedByName) return 'Sin atribuir';
  return [
    `Realizado por ${item.performedByName}`,
    item.completedAt ? formatDate(item.completedAt) : null,
    item.performedLocationName,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * DX-305: el instante con que se atribuye un realizado «Sin atribuir» del que
 * solo se sabe el DÍA: el mediodía de ese día en la zona de la sede (cae en ese
 * día civil, que es el que cuenta en «Comparar sedes»), o ahora si el mediodía
 * aún no ha llegado (la API no admite una fecha futura).
 */
export function attributionInstant(day: string, timeZone: string, now: Date = new Date()): string {
  const start = zonedDayStart(day, timeZone);
  if (start === null) return now.toISOString();
  const noon = new Date(new Date(start).getTime() + 12 * HOUR_MS);
  return (noon.getTime() > now.getTime() ? now : noon).toISOString();
}
