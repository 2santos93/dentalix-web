import { WORK_QUEUES_CHANGED_EVENT } from '@/components/work-queues/work-queues-context';

/**
 * DX-465 + DX-298: un intento, un lote, un «Agendó» o un recall nuevo cambian la
 * cola RECALL de «Mi día» y del menú; desde DX-298 las listas solo se releen
 * con este evento (o tras 60 s), así que se avisa tras cada escritura.
 */
export function announceRecallQueueChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(WORK_QUEUES_CHANGED_EVENT));
}
