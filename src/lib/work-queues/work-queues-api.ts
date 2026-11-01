import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

type Schemas = components['schemas'];

// «Mi día» (DX-503): tipos del cliente generado (`npm run codegen`).
export type WorkQueueKey = Schemas['WorkQueueKey'];
export type WorkQueueItem = Schemas['WorkQueueItemDto'];
export type WorkQueuesSummary = Schemas['WorkQueuesSummaryDto'];

/**
 * `GET /work-queues/summary`: los recuentos de las listas de trabajo del rol,
 * en la sede activa (la cabecera la pone `apiFetch`). Cada número es el de su
 * lista; una lista que no se pudo contar llega `ERROR` y las demás, igual.
 * `keys` acota (el contador del menú pide solo las suyas). Solo números: sin
 * pacientes ni teléfonos, y sin evento de auditoría.
 */
export function getWorkQueuesSummary(token: string, keys?: readonly WorkQueueKey[]): Promise<WorkQueuesSummary> {
  const query = keys && keys.length > 0 ? `?keys=${keys.join(',')}` : '';
  return apiFetch<WorkQueuesSummary>(`/work-queues/summary${query}`, { token });
}

/**
 * Las listas con contador en el menú, por rol: «Pendiente de cerrar»
 * (CLOSING_QUEUE_ROLES) y «Anamnesis por revisar» (CLINICAL_ROLES). Copian la
 * matriz de la API (`WORK_QUEUE_ROLES`); un rol sin ninguna no sondea.
 */
export function menuQueuesFor(role: ClinicRole | null): WorkQueueKey[] {
  if (!role) return [];
  const keys: WorkQueueKey[] = [];
  if (role !== 'ASSISTANT') keys.push('CLOSING_QUEUE');
  if (role !== 'RECEPTION') keys.push('ANAMNESIS_REVIEW');
  return keys;
}
