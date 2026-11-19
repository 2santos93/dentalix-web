import { ApiError } from '@/lib/api/api-error';
import { apiErrorMessage } from '@/lib/api/error-message';
import { addCivilDays } from '@/lib/time/wall-clock';
import type { RecallContactOutcome } from './recall-api';
import { OUTCOME_ORDER } from './presentation';

/**
 * DX-465 · Presentación de los intentos de recall. Aparte de `presentation.ts`
 * porque ese módulo lo carga el shell de la app (en todas las rutas); esto solo
 * lo usan la lista de recall, sus diálogos y la ficha.
 */

/** DX-465: «Llamar luego» admite de hoy a 90 días en la sede del paciente (igual que la API). */
export const RECALL_CALLBACK_MAX_DAYS = 90;
/** DX-465: los desenlaces del lote: todos menos «Agendó», que exige la cita de cada paciente. */
export const BATCH_OUTCOME_ORDER: readonly RecallContactOutcome[] = OUTCOME_ORDER.filter((o) => o !== 'BOOKED');

/** DX-465: «2 de 3»: intentos del ciclo frente al tope de la sede del paciente. */
export function attemptsLabel(attempts: number, maxAttempts: number): string {
  return `${attempts} de ${maxAttempts}`;
}

/**
 * DX-465: los días que admite «Llamar luego» (de hoy a 90 días en la sede de
 * cada paciente). Con varias sedes (el lote), el rango que vale en todas: desde
 * el «hoy» más tardío hasta 90 días después del más temprano. `null` si no se
 * sabe el «hoy» de alguna (sede sin zona horaria).
 */
export function callbackRange(todays: readonly (string | null)[]): { min: string; max: string } | null {
  if (todays.length === 0 || todays.some((t) => !t)) return null;
  const days = (todays as string[]).slice().sort();
  return { min: days[days.length - 1], max: addCivilDays(days[0], RECALL_CALLBACK_MAX_DAYS) };
}

export const callbackCopy = {
  label: 'Volver a llamar el',
  hint: `De hoy a ${RECALL_CALLBACK_MAX_DAYS} días. Ese día vuelve a la lista.`,
  required: 'Elige el día para volver a llamar.',
  past: 'La fecha para volver a llamar no puede ser anterior a hoy.',
  tooFar: `La fecha para volver a llamar admite hasta ${RECALL_CALLBACK_MAX_DAYS} días desde hoy.`,
};

/** DX-465: el error de la fecha de «Llamar luego», con los textos de la API; `null` si vale. */
export function callbackError(value: string | null, range: { min: string; max: string } | null): string | null {
  if (!value) return callbackCopy.required;
  if (!range) return null;
  if (value < range.min) return callbackCopy.past;
  if (value > range.max) return callbackCopy.tooFar;
  return null;
}

/** 409 de la API cuando otra persona escribe a la vez en el mismo recall o paciente. */
export const RECALL_WRITE_BUSY = 'RECALL_WRITE_BUSY';
export const recallWriteBusyMessage = 'Otra persona está guardando a la vez; vuelve a intentarlo.';

/**
 * El texto de un fallo al guardar un intento, el lote o «Ya está corregido»:
 * el 409 `RECALL_WRITE_BUSY` dice que se reintente; el resto, `apiErrorMessage`.
 */
export function recallWriteError(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.status === 409 && err.code === RECALL_WRITE_BUSY) return recallWriteBusyMessage;
  return apiErrorMessage(err, { fallback });
}
