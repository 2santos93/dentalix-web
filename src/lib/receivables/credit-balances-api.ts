import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

// Cartera › Saldo a favor (DX-430). La forma sale del Swagger de la API
// (`CreditBalancesPageDto`), así no se duplica a mano.
export type CreditBalancesPage = components['schemas']['CreditBalancesPageDto'];
export type CreditBalanceRow = components['schemas']['CreditBalanceRowDto'];

export interface CreditBalancesQuery {
  currency?: string;
  page?: number;
  pageSize?: number;
}

/**
 * `GET /receivables/credit-balances` — pacientes con saldo a favor de la sede
 * activa (la sede NO va aquí: el cliente manda `X-Location-Id` y la API la
 * aplica), una fila por paciente y moneda, de mayor a menor importe.
 */
export function getCreditBalances(token: string, query: CreditBalancesQuery = {}): Promise<CreditBalancesPage> {
  const search = new URLSearchParams();
  if (query.currency) search.set('currency', query.currency);
  if (query.page) search.set('page', String(query.page));
  if (query.pageSize) search.set('pageSize', String(query.pageSize));
  const text = search.toString();
  return apiFetch<CreditBalancesPage>(`/receivables/credit-balances${text ? `?${text}` : ''}`, { token });
}
