import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

export type Currency = components['schemas']['CurrencyDto'];

/** `GET /currencies` — full ISO 4217 whitelist with name + symbol. */
export async function listCurrencies(token: string): Promise<Currency[]> {
  return apiFetch<Currency[]>('/currencies', { token });
}

/**
 * `GET /public/currencies` — la misma lista, sin sesión: la usa el formulario
 * de registro (R18).
 */
export async function listPublicCurrencies(): Promise<Currency[]> {
  return apiFetch<Currency[]>('/public/currencies');
}
