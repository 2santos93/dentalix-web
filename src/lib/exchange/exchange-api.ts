import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

/**
 * `ExchangeController_rates`'s `RatesResponseDto` — `base` is always `"USD"`
 * today (see `schema.d.ts`), `rates` are units of each currency per 1 USD
 * for the requested `date`. Reused verbatim (fully `@ApiProperty()`-decorated,
 * same convention as `Dashboard` in `dashboard-api.ts`).
 */
export type ExchangeRates = components['schemas']['RatesResponseDto'];

/**
 * `GET /exchange/rates?date=YYYY-MM-DD` — the backend's `date` query param is
 * required (a day to fetch USD-base rates for). The caller passes the day: for
 * "today" it is the sede's (`sedeToday(timeZone)`), never the browser's
 * (DX-354b, E9), so there is no default here.
 */
export async function getExchangeRates(token: string, date: string): Promise<ExchangeRates> {
  const search = new URLSearchParams({ date });
  return apiFetch<ExchangeRates>(`/exchange/rates?${search.toString()}`, {
    token,
  });
}
