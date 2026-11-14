import type { ClinicLocation } from '@/lib/locations/locations-api';
import { locationRegionalFormat } from '@/lib/locations/location-settings';
import type { UpdatedTreatmentPlanItem } from '@/lib/treatment-plans/treatment-plans-api';

export const recallNoticeCopy = {
  due: (type: string, day: string) => `Recall de ${type}: vence el ${day}`,
  moved: (type: string) => `Recall de ${type} actualizado`,
  // D9: la exclusión lo desactivó porque otro tipo del mismo grupo pasó a activo.
  deactivated: (type: string, by: string) => `Recall de ${type} desactivado: lo sustituye ${by}`,
};

/**
 * Lo que el aviso lee de un recall movido: el del PATCH del ítem
 * (`ItemRecallUpdate`) y el del PUT del recall del paciente
 * (`RecallExclusionUpdate`, siempre desactivado) tienen esta forma.
 */
export interface RecallNoticeUpdate {
  recallTypeName: string;
  dueAt: string;
  deactivated?: boolean;
  replacedBy?: { recallTypeName: string } | null;
}

/**
 * DX-015-bis: el aviso de los recalls que movió un cambio de ítem del plan
 * (realizar, sacar de realizado o corregir un procedimiento que reinicia un
 * recall), con la fecha en el formato de la sede (`formatDay`); sin formato de
 * sede, sin fecha (nunca otro formato en su lugar). `null` si no movió ninguno.
 */
export function recallUpdatesNotice(
  updates: readonly RecallNoticeUpdate[] | undefined,
  formatDay: ((day: string) => string) | null,
): string | null {
  if (!updates || updates.length === 0) return null;
  return updates.map((u) => recallUpdateLine(u, formatDay)).join(' · ');
}

/** Una línea del aviso: desactivado por la exclusión (sin fecha: no vence) o su vencimiento. */
function recallUpdateLine(u: RecallNoticeUpdate, formatDay: ((day: string) => string) | null): string {
  if (u.deactivated && u.replacedBy) return recallNoticeCopy.deactivated(u.recallTypeName, u.replacedBy.recallTypeName);
  return formatDay ? recallNoticeCopy.due(u.recallTypeName, formatDay(u.dueAt)) : recallNoticeCopy.moved(u.recallTypeName);
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
