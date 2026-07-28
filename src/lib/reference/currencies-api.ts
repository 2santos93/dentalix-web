import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

export type Currency = components['schemas']['CurrencyDto'];

/** `GET /currencies` — full ISO 4217 whitelist with name + symbol. */
export async function listCurrencies(token: string): Promise<Currency[]> {
  return apiFetch<Currency[]>('/currencies', { token });
}
