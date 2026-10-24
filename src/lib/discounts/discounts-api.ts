import { apiFetch, apiFetchText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

// Descuentos (DX-204). Las formas salen del Swagger de la API.
export type DiscountPolicy = components['schemas']['DiscountPolicyDto'];
export type UpdateDiscountPolicyInput = components['schemas']['UpdateDiscountPolicyDto'];
export type ApplyBulkDiscountInput = components['schemas']['ApplyBulkDiscountDto'];
export type ApplyBulkDiscountResult = components['schemas']['ApplyBulkDiscountResultDto'];
export type DiscountReport = components['schemas']['DiscountReportDto'];
export type DiscountReportItem = components['schemas']['DiscountReportItemDto'];
export type DiscountReportTotal = components['schemas']['DiscountReportTotalDto'];
export type AgreementReductionTotal = components['schemas']['AgreementReductionTotalDto'];

/** Cambiar la política y ver el informe: solo ADMIN (como la API). */
export function canManageDiscounts(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/** `GET /discount-policy`: topes por rol y umbral del motivo de la clínica. */
export function getDiscountPolicy(token: string): Promise<DiscountPolicy> {
  return apiFetch<DiscountPolicy>('/discount-policy', { token });
}

/** `PUT /discount-policy`: reemplaza la política (solo ADMIN, auditado). */
export function updateDiscountPolicy(
  token: string,
  input: UpdateDiscountPolicyInput,
): Promise<DiscountPolicy> {
  return apiFetch<DiscountPolicy>('/discount-policy', { method: 'PUT', body: input, token });
}

/** `POST /treatment-plans/:id/items/bulk-discount`: «Descuento %» sobre varios ítems. */
export function applyBulkDiscount(
  token: string,
  planId: string,
  input: ApplyBulkDiscountInput,
): Promise<ApplyBulkDiscountResult> {
  return apiFetch<ApplyBulkDiscountResult>(`/treatment-plans/${planId}/items/bulk-discount`, {
    method: 'POST',
    body: input,
    token,
  });
}

/**
 * Filtros del informe. La sede NO va aquí: el cliente manda la sede activa en
 * `X-Location-Id` y la API la aplica (como la cartera).
 */
export interface DiscountReportFilters {
  from: string;
  to: string;
  professionalId?: string;
}

export interface DiscountReportQuery extends DiscountReportFilters {
  page?: number;
  pageSize?: number;
}

function searchOf(query: DiscountReportQuery): string {
  const search = new URLSearchParams({ from: query.from, to: query.to });
  if (query.professionalId) search.set('professionalId', query.professionalId);
  if (query.page) search.set('page', String(query.page));
  if (query.pageSize) search.set('pageSize', String(query.pageSize));
  return `?${search.toString()}`;
}

/** `GET /reports/discounts`: informe del periodo (solo ADMIN, auditado). */
export function getDiscountReport(token: string, query: DiscountReportQuery): Promise<DiscountReport> {
  return apiFetch<DiscountReport>(`/reports/discounts${searchOf(query)}`, { token });
}

/** `GET /reports/discounts.csv`: mismos filtros, sin paginar (solo ADMIN, auditado). */
export function downloadDiscountReportCsv(token: string, filters: DiscountReportFilters): Promise<string> {
  const { from, to, professionalId } = filters;
  return apiFetchText(`/reports/discounts.csv${searchOf({ from, to, professionalId })}`, { token });
}
