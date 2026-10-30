import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

// La API documenta todas las respuestas con @ApiProperty: los tipos salen tal
// cual del contrato generado (DX-374).
export type ExchangeRateSource = components['schemas']['ExchangeRateSource'];
export type ExchangeRateSettings = components['schemas']['ExchangeRateSettingsDto'];
export type ManualExchangeRate = components['schemas']['ManualExchangeRateDto'];
export type RegisterManualExchangeRateInput = components['schemas']['RegisterManualExchangeRateDto'];

/** Cuántas de las últimas tasas enseña la pantalla. */
export const MANUAL_RATES_SHOWN = 30;

/** Ver y cambiar la fuente y las tasas manuales: solo ADMIN (`/exchange/settings`, `/exchange/manual-rates`). */
export function canManageExchangeRates(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

export function getExchangeRateSettings(token: string): Promise<ExchangeRateSettings> {
  return apiFetch<ExchangeRateSettings>('/exchange/settings', { token });
}

export function saveExchangeRateSettings(token: string, source: ExchangeRateSource): Promise<ExchangeRateSettings> {
  return apiFetch<ExchangeRateSettings>('/exchange/settings', {
    method: 'PUT',
    body: { source },
    token,
  });
}

/** Las últimas tasas manuales de la clínica: día más reciente primero. */
export function listManualExchangeRates(token: string, limit = MANUAL_RATES_SHOWN): Promise<ManualExchangeRate[]> {
  const search = new URLSearchParams({ limit: String(limit) });
  return apiFetch<ManualExchangeRate[]>(`/exchange/manual-rates?${search.toString()}`, { token });
}

export function registerManualExchangeRate(
  token: string,
  input: RegisterManualExchangeRateInput,
): Promise<ManualExchangeRate> {
  return apiFetch<ManualExchangeRate>('/exchange/manual-rates', {
    method: 'POST',
    body: input,
    token,
  });
}

/** Los mismos límites que la API: > 0, hasta 8 decimales y menos de 10.000.000. */
export const RATE_INPUT_COPY = {
  missing: 'Escribe la tasa.',
  invalid: 'Escribe la tasa como un número sin separador de miles, por ejemplo 36,5.',
  notPositive: 'La tasa tiene que ser mayor que 0.',
  tooManyDecimals: 'La tasa admite hasta 8 decimales.',
  tooLarge: 'La tasa tiene que ser menor que 10.000.000.',
};

const RATE_RE = /^(\d{1,7})(?:[.,](\d{1,8}))?$/;

export type RateInputResult = { ok: true; value: number } | { ok: false; error: string };

/**
 * Lee la tasa tal como la escribe la persona: un número con `,` o `.` como
 * decimal y sin separador de miles (una tasa no es un importe: con 8 decimales,
 * «1.000» sería ambiguo). No es un campo de dinero, así que no pasa por
 * `parseMoneyInput`.
 */
export function parseRateInput(text: string): RateInputResult {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: false, error: RATE_INPUT_COPY.missing };
  if (/^\d+[.,]\d{9,}$/.test(trimmed)) return { ok: false, error: RATE_INPUT_COPY.tooManyDecimals };
  if (/^\d{8,}(?:[.,]\d*)?$/.test(trimmed)) return { ok: false, error: RATE_INPUT_COPY.tooLarge };
  const match = RATE_RE.exec(trimmed);
  if (!match) return { ok: false, error: RATE_INPUT_COPY.invalid };
  const value = Number(match[2] ? `${match[1]}.${match[2]}` : match[1]);
  if (!(value > 0)) return { ok: false, error: RATE_INPUT_COPY.notPositive };
  return { ok: true, value };
}
