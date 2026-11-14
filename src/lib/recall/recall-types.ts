import { KIND_LABELS, KIND_ORDER } from './presentation';
import type { PatientRecall, RecallKind, RecallType } from './recall-api';

/**
 * DX-015-bis: un tipo de recall tal como lo usa la pantalla. Viene de
 * `GET /recall-types`; si esa lectura falla, de las dos claves de siempre
 * (Higiene y Control), que la API sigue aceptando en la ruta y en el filtro.
 */
export interface RecallTypeOption {
  /** Lo que va en `PUT …/recalls/:type`: el id del tipo o, en el respaldo, su clave. */
  ref: string;
  /** Id del tipo; `null` en el respaldo. */
  id: string | null;
  systemKey: RecallKind | null;
  name: string;
  active: boolean;
  /** Intervalo por defecto del tipo; `null` en el respaldo. */
  defaultIntervalMonths: number | null;
}

/** Los tipos de la API por su orden, o el respaldo si no se pudieron leer (`null`). */
export function recallTypeOptions(types: readonly RecallType[] | null): RecallTypeOption[] {
  if (types === null) {
    return KIND_ORDER.map((kind) => ({
      ref: kind,
      id: null,
      systemKey: kind,
      name: KIND_LABELS[kind],
      active: true,
      defaultIntervalMonths: null,
    }));
  }
  return [...types]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'es'))
    .map((t) => ({
      ref: t.id,
      id: t.id,
      systemKey: t.systemKey,
      name: t.name,
      active: t.active,
      defaultIntervalMonths: t.defaultIntervalMonths,
    }));
}

/** Identificador estable de la fila (los `data-testid`): la clave si la tiene, si no el id. */
export function recallTypeKey(option: Pick<RecallTypeOption, 'systemKey' | 'ref'>): string {
  return option.systemKey ?? option.ref;
}

/**
 * El filtro de `GET /recall/due` para un `ref`: el id del tipo va como
 * `recallTypeId`; la clave del respaldo (`HYGIENE`, `CHECKUP`), como `kind`.
 */
export function recallTypeFilter(ref: string): { recallTypeId: string } | { kind: RecallKind } {
  return (KIND_ORDER as readonly string[]).includes(ref) ? { kind: ref as RecallKind } : { recallTypeId: ref };
}

/** El nombre del tipo de un recall o un contacto; sin él (API anterior), el de su clave. */
export function recallTypeLabel(r: { recallTypeName?: string | null; kind: RecallKind | null }): string {
  if (r.recallTypeName) return r.recallTypeName;
  return r.kind ? KIND_LABELS[r.kind] : 'Recall';
}

function belongsTo(option: RecallTypeOption, recall: Pick<PatientRecall, 'recallTypeId' | 'kind'>): boolean {
  return option.id !== null ? recall.recallTypeId === option.id : recall.kind === option.systemKey;
}

export interface RecallRow {
  type: RecallTypeOption;
  recall: PatientRecall | null;
  /**
   * Se puede fijar o cambiar. No, si el tipo del recall ya no está entre los de
   * la clínica (borrado): el PUT daría 404. En el respaldo no se sabe, y se
   * deja (la API devolvería su error en el diálogo).
   */
  editable: boolean;
}

/**
 * Los renglones del bloque de la ficha: un tipo activo por renglón (con su
 * recall o «Sin recall») y, además, cada recall de un tipo que ya no se ofrece
 * (desactivado, borrado o de otro tipo en el respaldo), para que no desaparezca.
 */
export function recallRows(options: readonly RecallTypeOption[], recalls: readonly PatientRecall[]): RecallRow[] {
  const fromApi = options.some((o) => o.id !== null);
  const rows: RecallRow[] = options
    .filter((o) => o.active)
    .map((type) => ({
      type,
      recall: recalls.find((r) => belongsTo(type, r)) ?? null,
      editable: true,
    }));
  for (const recall of recalls) {
    if (rows.some((row) => row.recall?.id === recall.id)) continue;
    // Un tipo desactivado sigue en la lista de la API: se edita por su id.
    const inactive = options.find((o) => belongsTo(o, recall));
    if (inactive) {
      rows.push({ type: inactive, recall, editable: true });
      continue;
    }
    rows.push({
      editable: !fromApi,
      type: {
        ref: recall.recallTypeId ?? recall.kind ?? '',
        id: recall.recallTypeId ?? null,
        systemKey: recall.kind,
        name: recallTypeLabel(recall),
        active: false,
        defaultIntervalMonths: null,
      },
      recall,
    });
  }
  return rows;
}

/**
 * De dónde cuenta el plazo de un recall (DX-015-bis):
 * - `procedure`: el último procedimiento disparador realizado (`lastDoneItemId`).
 * - `frozen`: la fecha que el despliegue congeló (la última visita atendida,
 *   que entonces movía el reloj); no la tecleó nadie (`preBackfillDoneAt`).
 * - `manual`: la fecha que fijó el clínico.
 */
export type RecallBasis = {
  kind: 'procedure' | 'frozen' | 'manual';
  day: string;
};

export function recallBasis(
  recall: Pick<PatientRecall, 'lastDoneAt' | 'lastDoneItemId' | 'preBackfillDoneAt'>,
): RecallBasis {
  if (recall.lastDoneItemId) return { kind: 'procedure', day: recall.lastDoneAt };
  if (recall.preBackfillDoneAt) return { kind: 'frozen', day: recall.lastDoneAt };
  return { kind: 'manual', day: recall.lastDoneAt };
}
