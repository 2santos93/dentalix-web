import type { ClinicLocation } from '@/lib/locations/locations-api';
import { locationRegionalFormat } from '@/lib/locations/location-settings';
import type { ItemRecallUpdate, UpdatedTreatmentPlanItem } from '@/lib/treatment-plans/treatment-plans-api';

export const recallNoticeCopy = {
  due: (type: string, day: string) => `Recall de ${type}: vence el ${day}`,
  moved: (type: string) => `Recall de ${type} actualizado`,
};

/**
 * DX-015-bis: el aviso de los recalls que movió un cambio de ítem del plan
 * (realizar, sacar de realizado o corregir un procedimiento que reinicia un
 * recall), con la fecha en el formato de la sede (`formatDay`); sin formato de
 * sede, sin fecha (nunca otro formato en su lugar). `null` si no movió ninguno.
 */
export function recallUpdatesNotice(
  updates: readonly ItemRecallUpdate[] | undefined,
  formatDay: ((day: string) => string) | null,
): string | null {
  if (!updates || updates.length === 0) return null;
  return updates
    .map((u) =>
      formatDay ? recallNoticeCopy.due(u.recallTypeName, formatDay(u.dueAt)) : recallNoticeCopy.moved(u.recallTypeName),
    )
    .join(' · ');
}

/**
 * El aviso de la respuesta del PATCH del ítem, con el formato de la sede donde
 * quedó realizado o, si ya no lo está, de `fallbackLocationId` (la sede activa).
 */
export function recallNoticeFor(
  saved: Pick<UpdatedTreatmentPlanItem, 'recallUpdates' | 'performedLocationId'>,
  locations: readonly ClinicLocation[],
  fallbackLocationId: string | null,
): string | null {
  const sede = locations.find((l) => l.id === (saved.performedLocationId ?? fallbackLocationId)) ?? null;
  const fmt = locationRegionalFormat(sede);
  return recallUpdatesNotice(saved.recallUpdates, fmt ? (day) => fmt.civilDate(day) : null);
}
