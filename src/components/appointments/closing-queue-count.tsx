'use client';
import { useWorkQueueCount, WORK_QUEUES_CHANGED_EVENT } from '@/components/work-queues/work-queues-context';

/** Evento de ventana tras cerrar o descartar un pendiente: los contadores se releen al momento. */
export const CLOSING_QUEUE_CHANGED_EVENT = WORK_QUEUES_CHANGED_EVENT;

export function notifyClosingQueueChanged(): void {
  window.dispatchEvent(new Event(CLOSING_QUEUE_CHANGED_EVENT));
}

/**
 * DX-439 / DX-503: el contador de «Pendiente de cerrar» del menú y de la
 * cabecera de la Agenda. Sale de la MISMA lectura de `GET /work-queues/summary`
 * que «Mi día» en Inicio (`WorkQueuesProvider` del AppShell), así que los tres
 * enseñan el mismo número. 0 sin proveedor o sin permiso.
 */
export function useClosingQueueCount(): number {
  return useWorkQueueCount('CLOSING_QUEUE');
}
