import type { ClinicRole } from '@/lib/appointments/staff-api';
import type { TreatmentPlanItem } from '@/lib/treatment-plans/treatment-plans-api';
import { formatDate } from '@/lib/format/date';

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
