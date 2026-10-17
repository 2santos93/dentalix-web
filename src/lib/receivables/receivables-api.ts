import { apiFetch, apiFetchText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

// Cartera por antigüedad (DX-145). La forma sale del Swagger de la API
// (`ReceivablesAgingPageDto`), así no se duplica a mano.
export type ReceivablesAgingPage = components['schemas']['ReceivablesAgingPageDto'];
export type AgingRow = components['schemas']['AgingRowDto'];
export type AgingCurrency = components['schemas']['AgingCurrencyDto'];
export type AgingTotal = components['schemas']['AgingTotalDto'];
export type AgingBuckets = components['schemas']['AgingBucketsDto'];

/**
 * Filtros de la lista y del CSV. La sede NO va aquí: el cliente manda la sede
 * activa en `X-Location-Id` en cada petición y la API la aplica.
 */
export interface ReceivablesFilters {
  currency?: string;
  minBalance?: number;
  minAgeDays?: number;
}

export interface ReceivablesQuery extends ReceivablesFilters {
  page?: number;
  pageSize?: number;
}

function searchOf(query: ReceivablesQuery): string {
  const search = new URLSearchParams();
  if (query.currency) search.set('currency', query.currency);
  if (query.minBalance !== undefined) search.set('minBalance', String(query.minBalance));
  if (query.minAgeDays !== undefined) search.set('minAgeDays', String(query.minAgeDays));
  if (query.page) search.set('page', String(query.page));
  if (query.pageSize) search.set('pageSize', String(query.pageSize));
  const text = search.toString();
  return text ? `?${text}` : '';
}

/** `GET /receivables/aging` — deudores de la sede activa, por antigüedad. */
export function getReceivablesAging(
  token: string,
  query: ReceivablesQuery = {},
): Promise<ReceivablesAgingPage> {
  return apiFetch<ReceivablesAgingPage>(`/receivables/aging${searchOf(query)}`, { token });
}

/** `GET /receivables/aging.csv` — mismo filtro, sin paginar. Solo ADMIN (auditado). */
export function downloadReceivablesCsv(token: string, filters: ReceivablesFilters = {}): Promise<string> {
  const { currency, minBalance, minAgeDays } = filters;
  return apiFetchText(`/receivables/aging.csv${searchOf({ currency, minBalance, minAgeDays })}`, {
    token,
  });
}
