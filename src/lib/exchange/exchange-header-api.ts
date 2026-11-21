import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

/**
 * DX-584: la tasa del día que enseña el menú para la sede activa y las monedas
 * en que la clínica acepta cobros. `GET /exchange/header` responde a cualquier
 * miembro (ADMIN, DENTIST, ASSISTANT, RECEPTION), con su propio límite suave.
 */
export type ExchangeHeader = components['schemas']['ExchangeHeaderDto'];
export type ExchangeHeaderRate = components['schemas']['ExchangeHeaderRateDto'];

export function getExchangeHeader(token: string): Promise<ExchangeHeader> {
  return apiFetch<ExchangeHeader>('/exchange/header', { token });
}

/**
 * Evento de ventana tras algo que mueve la tasa del menú o las monedas de la
 * clínica (registrar o corregir una tasa manual, cambiar la fuente, el plazo o
 * las monedas): el indicador y el selector de moneda del cobro se releen al momento.
 */
export const EXCHANGE_RATES_CHANGED_EVENT = 'dentalix:exchange-rates-changed';

export function notifyExchangeRatesChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EXCHANGE_RATES_CHANGED_EVENT));
}
