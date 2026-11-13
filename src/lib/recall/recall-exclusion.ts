import type { RecallType } from './recall-api';

/**
 * DX-015-bis (D13): «Excluyente con…» en Ajustes › Recall. El usuario elige
 * otro tipo; la pantalla traduce eso a grupos de exclusión (`exclusionGroup`),
 * que la API valida con este mismo patrón.
 */
export const EXCLUSION_GROUP_PATTERN = /^[A-Z0-9_]{1,40}$/;

type GroupedType = Pick<RecallType, 'id' | 'name' | 'exclusionGroup'>;

/** Un grupo nuevo: `G_` y 8 caracteres en mayúsculas (`G_3F9A0C21`). */
export function newExclusionGroup(random: () => string = () => crypto.randomUUID()): string {
  return `G_${random().replace(/[^a-z0-9]/gi, '').slice(0, 8).toUpperCase()}`;
}

/** Los otros tipos que comparten grupo con `type`, en el orden de `types`. */
export function exclusivePartners<T extends GroupedType>(
  type: Pick<RecallType, 'id' | 'exclusionGroup'>,
  types: readonly T[],
): T[] {
  if (type.exclusionGroup === null) return [];
  return types.filter((t) => t.id !== type.id && t.exclusionGroup === type.exclusionGroup);
}

/** El tipo que el selector muestra elegido: el primero del mismo grupo; `null` = «Ninguno». */
export function currentPartnerId(
  type: Pick<RecallType, 'id' | 'exclusionGroup'> | null,
  types: readonly GroupedType[],
): string | null {
  if (!type) return null;
  return exclusivePartners(type, types)[0]?.id ?? null;
}

export interface ExclusionPlan {
  /** El grupo que debe llevar el tipo; `undefined` = no cambia (no se manda). */
  selfGroup: string | null | undefined;
  /** El PATCH del otro tipo cuando no tenía grupo y se crea uno para los dos. */
  partnerPatch: { id: string; exclusionGroup: string } | null;
}

/**
 * Qué grupo lleva el tipo y qué otro tipo hay que tocar al elegir «Excluyente
 * con…» (D13):
 * - lo mismo que había → nada;
 * - «Ninguno» (`partnerId` null) → el grupo del tipo a `null` (los demás no se tocan);
 * - un tipo que ya tiene grupo → el suyo;
 * - un tipo sin grupo → uno nuevo para los dos (sin chocar con los que hay).
 *
 * `self` es el tipo que se edita (`id: null` al crearlo). Nada de esto cambia
 * los recalls de hoy: la API lo aplica en el próximo DONE o PUT (D10).
 */
export function planExclusion({
  self,
  partnerId,
  types,
  makeGroup = newExclusionGroup,
}: {
  self: { id: string | null; exclusionGroup: string | null };
  partnerId: string | null;
  types: readonly GroupedType[];
  makeGroup?: () => string;
}): ExclusionPlan {
  const unchanged: ExclusionPlan = { selfGroup: undefined, partnerPatch: null };
  const partner = partnerId ? types.find((t) => t.id === partnerId && t.id !== self.id) : undefined;
  if (!partner) {
    return self.exclusionGroup === null ? unchanged : { selfGroup: null, partnerPatch: null };
  }
  if (partner.exclusionGroup !== null) {
    return partner.exclusionGroup === self.exclusionGroup
      ? unchanged
      : { selfGroup: partner.exclusionGroup, partnerPatch: null };
  }
  const used = new Set(types.map((t) => t.exclusionGroup).filter((g): g is string => g !== null));
  let group = makeGroup();
  for (let tries = 0; used.has(group) && tries < 10; tries++) group = makeGroup();
  return { selfGroup: group, partnerPatch: { id: partner.id, exclusionGroup: group } };
}
