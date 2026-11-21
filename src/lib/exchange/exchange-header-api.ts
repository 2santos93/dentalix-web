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

/**
 * DX-586: «Actualizar tasa». `POST /exchange/refresh` vuelve a consultar la
 * tasa de hoy en el acto (BCV: oficial → respaldo; automática: el proveedor) y
 * responde el mismo cuerpo que `GET /exchange/header`, ya recalculado, más
 * `refresh`: `ok`, o `ok: false` con el mensaje si la fuente no dio la tasa
 * (siempre 200: nunca un 5xx por la fuente). Lo pueden ADMIN, recepción y
 * quien cobra con PAYMENT_REGISTER. Con fuente manual, 409
 * `EXCHANGE_RATE_REFRESH_MANUAL`; más de una vez cada 5 min por clínica, 429
 * `EXCHANGE_RATE_REFRESH_TOO_SOON` con `retryAfterSeconds`.
 */
export type ExchangeRefresh = components['schemas']['ExchangeRefreshDto'];

/** Cada cuánto deja la API volver a consultar (por clínica). */
export const EXCHANGE_REFRESH_COOLDOWN_MS = 5 * 60_000;

export function refreshExchangeRates(token: string): Promise<ExchangeRefresh> {
  return apiFetch<ExchangeRefresh>('/exchange/refresh', { method: 'POST', token });
}

/** DX-586: el ancla de Ajustes › Tasa de cambio que abre «Registrar tasa» al llegar (enlace del popover con tasa manual). */
export const RATE_REGISTER_HASH = 'registrar-tasa';
