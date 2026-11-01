import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

/**
 * DX-517: el texto propio de cada moneda de la clínica («VES» → «Bs.»). Sin
 * ninguno, los importes llevan el código ISO (DX-378). Lo lee toda la app con
 * la marca de la clínica (`fetchBranding`); aquí solo lo edita administración.
 */
export type ClinicCurrencyTexts = components['schemas']['ClinicCurrencyTextsDto'];
export type CurrencyTextEntry = components['schemas']['CurrencyTextEntryDto'];

/** Solo administración (la API lo exige). */
export function canManageCurrencyTexts(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/** `GET /exchange/currency-texts` (solo ADMIN). */
export function getCurrencyTexts(token: string): Promise<ClinicCurrencyTexts> {
  return apiFetch<ClinicCurrencyTexts>('/exchange/currency-texts', { token });
}

/** `PUT /exchange/currency-texts`: sustituye la lista entera; vacía = ninguno. Auditado. */
export function saveCurrencyTexts(token: string, entries: CurrencyTextEntry[]): Promise<ClinicCurrencyTexts> {
  return apiFetch<ClinicCurrencyTexts>('/exchange/currency-texts', {
    method: 'PUT',
    body: { entries },
    token,
  });
}
