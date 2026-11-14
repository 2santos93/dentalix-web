import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

/**
 * DX-224 «¿Quién llama?»: `POST /patients/lookup-by-phone`. El número va en el
 * CUERPO (una URL con un teléfono queda en los registros del proxy y del
 * navegador). La API lo lee con el prefijo de la sede activa y lo compara por
 * E.164 completo; devuelve a todos los pacientes que lo tienen (un grupo
 * familiar) con su próxima cita, su última visita y su saldo.
 */
export type CallerMatch = components['schemas']['CallerMatchDto'];
export type CallerLookupResponse = components['schemas']['CallerLookupResponseDto'];

/** Con menos dígitos no se identifica a nadie (la API responde 400 igual). */
export const MIN_CALLER_DIGITS = 7;

/** Cuántos dígitos decimales (de cualquier escritura) trae lo escrito. */
export function callerDigitCount(text: string): number {
  return (text.normalize('NFKC').match(/\p{Nd}/gu) ?? []).length;
}

export function hasEnoughCallerDigits(text: string): boolean {
  return callerDigitCount(text) >= MIN_CALLER_DIGITS;
}

export interface CallerLookupResult {
  matches: CallerMatch[];
  /** Hay más pacientes con ese número que los mostrados. */
  truncated: boolean;
}

export async function lookupCaller(token: string, phone: string): Promise<CallerLookupResult> {
  const res = await apiFetch<CallerLookupResponse>('/patients/lookup-by-phone', {
    method: 'POST',
    body: { phone: phone.trim() },
    token,
  });
  return { matches: res.matches, truncated: res.truncated === true };
}
