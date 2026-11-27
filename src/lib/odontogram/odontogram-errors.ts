import { ApiError } from '@/lib/api/api-error';
import { apiErrorMessage } from '@/lib/api/error-message';

/**
 * DX-132: códigos estables de la API del odontograma. La web decide por el
 * `code`, nunca por el texto; el texto del servidor (ya en español) es lo que
 * se enseña, con un respaldo propio por si no llega.
 */
export const ODONTOGRAM_AS_OF_FUTURE = 'ODONTOGRAM_AS_OF_FUTURE';
export const ODONTOGRAM_AS_OF_INVALID = 'ODONTOGRAM_AS_OF_INVALID';
export const TOOTH_DENTITION_MISMATCH = 'TOOTH_DENTITION_MISMATCH';

export const odontogramErrorCopy = {
  asOfFuture: 'La fecha de la carta no puede ser futura',
  asOfInvalid: 'La fecha de la carta debe tener el formato AAAA-MM-DD y existir en el calendario',
  dentitionMismatch:
    'El diente no cabe en la dentición actual de esa posición. Cambia la dentición en el odontograma antes de marcarlo como realizado.',
};

/**
 * El 400 de «Ver la carta al…» (fecha futura o inexistente): no es un fallo
 * transitorio, así que se explica sin «Reintentar». `null` si es otro error.
 */
export function asOfErrorMessage(err: unknown): string | null {
  if (!(err instanceof ApiError) || err.status !== 400) return null;
  if (err.code === ODONTOGRAM_AS_OF_FUTURE) return apiErrorMessage(err, { byStatus: { 400: odontogramErrorCopy.asOfFuture } });
  if (err.code === ODONTOGRAM_AS_OF_INVALID) return apiErrorMessage(err, { byStatus: { 400: odontogramErrorCopy.asOfInvalid } });
  return null;
}

/**
 * El 422 `TOOTH_DENTITION_MISMATCH` al marcar «Realizado» (o al registrar): el
 * mensaje del servidor nombra el diente y la posición; `null` si es otro error.
 */
export function dentitionMismatchMessage(err: unknown): string | null {
  if (!(err instanceof ApiError) || err.status !== 422 || err.code !== TOOTH_DENTITION_MISMATCH) return null;
  return apiErrorMessage(err, { byStatus: { 422: odontogramErrorCopy.dentitionMismatch } });
}
