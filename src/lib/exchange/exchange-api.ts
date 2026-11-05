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
export async function getExchangeRates(
  token: string,
  date: string,
  currencies: readonly string[] = [],
): Promise<ExchangeRates> {
  const search = new URLSearchParams({ date });
  // DX-384: con las monedas con que se va a convertir, la API devuelve, con
  // fuente manual y sin tasa de ese día, la última registrada dentro del
  // plazo de la clínica y la fecha de la que son (`rateDate`).
  if (currencies.length > 0) search.set('currencies', currencies.join(','));
  return apiFetch<ExchangeRates>(`/exchange/rates?${search.toString()}`, {
    token,
  });
}
