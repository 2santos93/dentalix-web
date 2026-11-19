/**
 * DX-562: límites de la recurrencia de una serie (los mismos que valida la
 * API) y su validación en el formulario. Módulo aparte y sin dependencias:
 * `AppointmentForm` va en el shell (búsqueda por llamada) y no debe arrastrar
 * el cliente de series ni la vista previa.
 */
export const SERIES_INTERVAL_MIN = 1;
export const SERIES_INTERVAL_MAX = 12;
export const SERIES_COUNT_MIN = 2;
export const SERIES_COUNT_MAX = 26;

export type SeriesEndMode = 'count' | 'until';

export interface RecurrenceDraft {
  intervalWeeks: string;
  endMode: SeriesEndMode;
  count: string;
  until: string;
}

export interface RecurrenceErrors {
  interval?: string;
  count?: string;
  until?: string;
}

export const recurrenceErrorCopy = {
  interval: `Indica cada cuántas semanas: de ${SERIES_INTERVAL_MIN} a ${SERIES_INTERVAL_MAX}.`,
  count: `Indica cuántas veces: de ${SERIES_COUNT_MIN} a ${SERIES_COUNT_MAX}.`,
  until: 'Elige una fecha final posterior a la primera cita.',
};

/** Entero dentro de [min, max] escrito en un campo, o `null`. */
function boundedInt(text: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const n = Number(text.trim());
  return n >= min && n <= max ? n : null;
}

/**
 * La recurrencia lista para la API (`intervalWeeks` + `count` o `until`) o los
 * errores por campo. `firstDay` es el día civil de la primera cita; `until`
 * llega ya validado como día civil (o vacío).
 */
export function parseRecurrence(
  draft: RecurrenceDraft,
  firstDay: string,
):
  | { ok: true; value: { intervalWeeks: number; count?: number; until?: string } }
  | { ok: false; errors: RecurrenceErrors } {
  const weeks = boundedInt(draft.intervalWeeks, SERIES_INTERVAL_MIN, SERIES_INTERVAL_MAX);
  const count = draft.endMode === 'count' ? boundedInt(draft.count, SERIES_COUNT_MIN, SERIES_COUNT_MAX) : null;
  const until = draft.endMode === 'until' && /^\d{4}-\d{2}-\d{2}$/.test(draft.until) && draft.until > firstDay ? draft.until : null;
  const errors: RecurrenceErrors = {
    ...(weeks === null ? { interval: recurrenceErrorCopy.interval } : {}),
    ...(draft.endMode === 'count' && count === null ? { count: recurrenceErrorCopy.count } : {}),
    ...(draft.endMode === 'until' && until === null ? { until: recurrenceErrorCopy.until } : {}),
  };
  if (weeks === null || Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { intervalWeeks: weeks, ...(count !== null ? { count } : {}), ...(until !== null ? { until } : {}) },
  };
}
