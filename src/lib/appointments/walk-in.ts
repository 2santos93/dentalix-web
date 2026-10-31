import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

/**
 * DX-470 «Atender sin cita»: urgencia en un paso. Paciente (existente o alta
 * mínima), profesional, señales de triaje y nota; la API pone la sede (la de
 * la cabecera, entre las permitidas), la hora (su reloj) y el autor (el
 * token), y deja la cita en «En clínica».
 */
export type TriageFlag = components['schemas']['TriageFlag'];
export type CreateWalkInInput = components['schemas']['CreateWalkInDto'];
export type WalkInResult = components['schemas']['WalkInResultDto'];

/** Las 6 señales, en el orden de la API (política tipo CareQuest). */
export const TRIAGE_FLAGS: readonly TriageFlag[] = ['PAIN', 'SWELLING', 'INFECTION', 'FEVER', 'BLEEDING', 'TRAUMA'];

export const TRIAGE_LABELS: Record<TriageFlag, string> = {
  PAIN: 'Dolor',
  SWELLING: 'Inflamación',
  INFECTION: 'Infección',
  FEVER: 'Fiebre',
  BLEEDING: 'Sangrado',
  TRAUMA: 'Traumatismo',
};

export const TRIAGE_NOTE_MAX = 200;
export const OVERBOOK_REASON_MIN = 5;
export const OVERBOOK_REASON_MAX = 300;
/**
 * Dígitos mínimos del teléfono del alta mínima. La API pide 5 caracteres
 * tras recortar; contar dígitos es más estricto, así que nunca rechaza uno
 * que la web dejó pasar.
 */
export const PHONE_MIN_DIGITS = 5;

/** Códigos del 409 que el diálogo convierte en el paso siguiente. */
export const NO_RESERVED_SLOT = 'NO_RESERVED_SLOT';
export const PATIENT_DUPLICATE = 'PATIENT_DUPLICATE';

/** Quién lo usa: el mostrador, como «Llegó» (DX-200). */
export function canWalkIn(role: string | null): boolean {
  return role === 'RECEPTION' || role === 'ASSISTANT' || role === 'ADMIN';
}

/** Las señales de una lista, en su orden y con su nombre. */
export function triageLabels(flags: readonly TriageFlag[] | undefined): string[] {
  const set = new Set(flags ?? []);
  return TRIAGE_FLAGS.filter((f) => set.has(f)).map((f) => TRIAGE_LABELS[f]);
}

export function validOverbookReason(reason: string): boolean {
  const trimmed = reason.trim();
  return trimmed.length >= OVERBOOK_REASON_MIN && trimmed.length <= OVERBOOK_REASON_MAX && !/[\r\n]/.test(trimmed);
}

/** `POST /appointments/walk-in` en la sede `locationId` (si la hay elegida). */
export async function createWalkIn(
  token: string,
  input: CreateWalkInInput,
  locationId: string | null,
): Promise<WalkInResult> {
  return apiFetch<WalkInResult>('/appointments/walk-in', {
    method: 'POST',
    token,
    body: input,
    ...(locationId ? { headers: { 'X-Location-Id': locationId } } : {}),
  });
}
