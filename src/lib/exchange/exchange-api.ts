import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

/**
 * `ExchangeController_rates`'s `RatesResponseDto` — `base` is always `"USD"`
 * today (see `schema.d.ts`), `rates` are units of each currency per 1 USD
 * for the requested `date`. Reused verbatim (fully `@ApiProperty()`-decorated,
 * same convention as `Dashboard` in `dashboard-api.ts`).
 */
export type ExchangeRates = components['schemas']['RatesResponseDto'];

function todayLocalDateString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * `GET /exchange/rates?date=YYYY-MM-DD` — the backend's `date` query param is
 * required (a historical day to fetch USD-base rates for), so this defaults
 * it to today's local date when the caller omits it, keeping the call
 * ergonomic for "just give me the current supported currencies" callers like
 * `DashboardView`'s currency `<select>`.
 */
export async function getExchangeRates(token: string, date?: string): Promise<ExchangeRates> {
  const search = new URLSearchParams({ date: date ?? todayLocalDateString() });
  return apiFetch<ExchangeRates>(`/exchange/rates?${search.toString()}`, {
    token,
  });
}
