import { apiFetch, apiFetchText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

// «Cobrado sin imputar / a cuenta» (DX-399). La forma sale del Swagger de la
// API (`UnallocatedPaymentsPageDto`), así no se duplica a mano.
export type UnallocatedPaymentsPage = components['schemas']['UnallocatedPaymentsPageDto'];
export type UnallocatedPaymentRow = components['schemas']['UnallocatedPaymentRowDto'];
export type UnallocatedTotal = components['schemas']['UnallocatedTotalDto'];

export interface UnallocatedPaymentsFilters {
  /** Primer día (AAAA-MM-DD, días civiles de la sede del abono). */
  from: string;
  to: string;
  /** Solo los abonos de esta sede; sin ella, todas las que ve quien consulta. */
  locationId?: string;
}

function search(filters: UnallocatedPaymentsFilters, extra: Record<string, number | undefined> = {}): string {
  const params = new URLSearchParams({ from: filters.from, to: filters.to });
  if (filters.locationId) params.set('locationId', filters.locationId);
  for (const [key, value] of Object.entries(extra)) if (value !== undefined) params.set(key, String(value));
  return `?${params.toString()}`;
}

/**
 * `GET /reports/unallocated-payments` — los abonos del período con algo sin
 * imputar a ítems del plan, del más reciente al más antiguo. La sede va en
 * `locationId`: la cabecera X-Location-Id no acota. ADMIN y recepción.
 */
export function getUnallocatedPayments(
  token: string,
  filters: UnallocatedPaymentsFilters,
  page: { page: number; pageSize: number },
): Promise<UnallocatedPaymentsPage> {
  return apiFetch<UnallocatedPaymentsPage>(`/reports/unallocated-payments${search(filters, page)}`, { token });
}

/** `GET /reports/unallocated-payments.csv`: los mismos filtros, todas las filas. */
export function downloadUnallocatedPaymentsCsv(token: string, filters: UnallocatedPaymentsFilters): Promise<string> {
  return apiFetchText(`/reports/unallocated-payments.csv${search(filters)}`, { token });
}
