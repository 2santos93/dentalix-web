import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

export type Country = components['schemas']['CountryDto'];

/** `GET /countries` — full list, sorted by name. */
export async function listCountries(token: string): Promise<Country[]> {
  return apiFetch<Country[]>('/countries', { token });
}
