import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

// Lecturas de Inicio que no tienen cliente propio en `src/lib` (I1). Los
// recuentos de «Pendientes» salen de `GET /work-queues/summary` (DX-503). Todas son
// SOLO NÚMEROS: sin pacientes, sin teléfonos, sin auditoría — la API las sirve
// así a propósito para que abrir Inicio no deje un evento de «consultó la
// cartera» ni viaje un dato personal que la pantalla no enseña.

export type ReceivablesSummary = components['schemas']['ReceivablesAgingSummaryDto'];
export type AgingTotal = ReceivablesSummary['totals'][number];
export type AgingBuckets = AgingTotal['buckets'];

/** `GET /receivables/aging/summary`: los totales por moneda de la cartera, sin filas. */
export function getReceivablesSummary(token: string): Promise<ReceivablesSummary> {
  return apiFetch<ReceivablesSummary>('/receivables/aging/summary', { token });
}

/** Lo exigible ya vencido de un total: la deuda menos las cuotas que aún no vencen. */
export function overdueOf(total: Pick<AgingTotal, 'buckets'>): number {
  const b = total.buckets;
  return Math.round((b.days0to30 + b.days31to60 + b.days61to90 + b.over90) * 100) / 100;
}
