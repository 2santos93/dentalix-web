import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

// Lecturas de Inicio que no tienen cliente propio en `src/lib` (I1). Todas son
// SOLO NÚMEROS: sin pacientes, sin teléfonos, sin auditoría — la API las sirve
// así a propósito para que abrir Inicio no deje un evento de «consultó la
// cartera» ni viaje un dato personal que la pantalla no enseña.

export type ClosingQueueCount = components['schemas']['ClosingQueueCountDto'];
export type FollowUpCount = components['schemas']['PendingFollowUpCountDto'];
export type UnscheduledCount = components['schemas']['UnscheduledPlansCountDto'];
export type ReceivablesSummary = components['schemas']['ReceivablesAgingSummaryDto'];
export type AgingTotal = ReceivablesSummary['totals'][number];
export type AgingBuckets = AgingTotal['buckets'];

/**
 * `GET /closing-queue/count` (DX-439): citas pasadas sin desenlace, evolución y
 * tratamiento sin marcar, ya acotado por rol en la API (recepción, el
 * desenlace de sus sedes; el odontólogo, sus citas; ADMIN, todo).
 */
export function getClosingQueueCount(token: string): Promise<ClosingQueueCount> {
  return apiFetch<ClosingQueueCount>('/closing-queue/count', { token });
}

/** `GET /treatment-plans/pending-follow-up/count`: «Presupuestos por seguir» (presentados hace más de 7 días). */
export function getFollowUpCount(token: string): Promise<FollowUpCount> {
  return apiFetch<FollowUpCount>('/treatment-plans/pending-follow-up/count', { token });
}

/** `GET /treatment-plans/unscheduled/count`: planes aceptados con algo sin agendar, en la sede activa. */
export function getUnscheduledCount(token: string): Promise<UnscheduledCount> {
  return apiFetch<UnscheduledCount>('/treatment-plans/unscheduled/count', { token });
}

/** `GET /receivables/aging/summary`: los totales por moneda de la cartera, sin filas. */
export function getReceivablesSummary(token: string): Promise<ReceivablesSummary> {
  return apiFetch<ReceivablesSummary>('/receivables/aging/summary', { token });
}

/** Lo exigible ya vencido de un total: la deuda menos las cuotas que aún no vencen. */
export function overdueOf(total: Pick<AgingTotal, 'buckets'>): number {
  const b = total.buckets;
  return Math.round((b.days0to30 + b.days31to60 + b.days61to90 + b.over90) * 100) / 100;
}
