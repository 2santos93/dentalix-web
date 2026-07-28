import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

export type City = components['schemas']['CityDto'];

export interface SearchCitiesParams {
  countryCode: string;
  q?: string;
  limit?: number;
}

/** `GET /cities?countryCode&q&limit` — capped, name-filtered list for a country. */
export async function searchCities(
  token: string,
  params: SearchCitiesParams,
): Promise<City[]> {
  const search = new URLSearchParams();
  search.set('countryCode', params.countryCode);
  if (params.q) search.set('q', params.q);
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  return apiFetch<City[]>(`/cities?${search.toString()}`, { token });
}
