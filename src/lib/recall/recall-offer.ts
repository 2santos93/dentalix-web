import { RECALL_INTERVALS } from './presentation';
import type { PatientRecall } from './recall-api';

/** Lo que la salida y «Sin recall configurado» necesitan de un tipo para proponerlo. */
export interface OfferedRecallType {
  id: string;
  name: string;
  defaultIntervalMonths: number;
}

/** Cuántos tipos se ofrecen como botón en la salida; el resto va en «Otros…». */
export const CHECKOUT_RECALL_BUTTONS = 2;

/**
 * DX-015-bis (D16): los tipos que la salida ofrece en «Próxima visita». Solo si
 * el punto está pendiente (la API ya manda `recallTypes` vacío si no): los dos
 * primeros como botón, el resto en «Otros…». `null` = no se ofrece nada.
 */
export function checkoutRecallOffer<T extends OfferedRecallType>(
  nextVisitDone: boolean,
  types: readonly T[] | undefined,
): { buttons: T[]; more: T[] } | null {
  if (nextVisitDone || !types || types.length === 0) return null;
  return { buttons: types.slice(0, CHECKOUT_RECALL_BUTTONS), more: types.slice(CHECKOUT_RECALL_BUTTONS) };
}

/** «6 meses», «1 mes». */
export function monthsLabel(months: number): string {
  return months === 1 ? '1 mes' : `${months} meses`;
}

/** Los meses que admite la API para el intervalo (1–36). */
export const RECALL_MONTHS_MIN = 1;
export const RECALL_MONTHS_MAX = 36;

/** Opciones de meses del selector: las habituales más el valor elegido si no está. */
export function monthOptions(current: number | null): number[] {
  const set = new Set(RECALL_INTERVALS);
  if (current !== null && current >= RECALL_MONTHS_MIN && current <= RECALL_MONTHS_MAX) set.add(current);
  return [...set].sort((a, b) => a - b);
}

/**
 * D18: los meses con que se prellena el recall de la evolución para un tipo:
 * el intervalo del recall que el paciente ya tiene de ese tipo (activo o no) o,
 * sin él, el por defecto del tipo.
 */
export function evolutionRecallMonths(
  type: Pick<OfferedRecallType, 'id' | 'defaultIntervalMonths'>,
  recalls: readonly Pick<PatientRecall, 'recallTypeId' | 'intervalMonths'>[] | null,
): number {
  return recalls?.find((r) => r.recallTypeId === type.id)?.intervalMonths ?? type.defaultIntervalMonths;
}

/** El borrador del recall de la evolución: `enabled: false` = «Sin cambios» (no se manda). */
export interface EvolutionRecallDraft {
  enabled: boolean;
  recallTypeId: string | null;
  intervalMonths: number | null;
}

export const emptyEvolutionRecallDraft: EvolutionRecallDraft = {
  enabled: false,
  recallTypeId: null,
  intervalMonths: null,
};

/**
 * D18: lo que viaja en `CreateClinicalEntryDto.recall`. Nada si no se activó;
 * un error en español si se activó a medias o los meses no están en 1–36.
 */
export function evolutionRecallPayload(
  draft: EvolutionRecallDraft,
): { recall?: { recallTypeId: string; intervalMonths: number } } | { error: string } {
  if (!draft.enabled) return {};
  if (!draft.recallTypeId) return { error: 'Elige el tipo de recall o deja «Sin cambios».' };
  const months = draft.intervalMonths;
  if (months === null || !Number.isInteger(months) || months < RECALL_MONTHS_MIN || months > RECALL_MONTHS_MAX) {
    return { error: `Elige cada cuántos meses vuelve (de ${RECALL_MONTHS_MIN} a ${RECALL_MONTHS_MAX}).` };
  }
  return { recall: { recallTypeId: draft.recallTypeId, intervalMonths: months } };
}
