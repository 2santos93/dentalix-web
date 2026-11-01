import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

type CurrencyDto = components['schemas']['CurrencyDto'];

/**
 * Una moneda del catálogo. DX-340: `minorUnits` (ISO 4217) y `roundingDigits`
 * (redondeo por línea) son opcionales aquí a propósito: una API anterior en
 * el hueco del despliegue no los manda, y la lista de monedas sigue sirviendo
 * para elegir. Quien redondea los lee con `contractRoundingDigits`.
 */
export type Currency = Omit<CurrencyDto, 'minorUnits' | 'roundingDigits'> &
  Partial<Pick<CurrencyDto, 'minorUnits' | 'roundingDigits'>>;

/** `GET /currencies` — full ISO 4217 whitelist with name + symbol. */
export async function listCurrencies(token: string): Promise<Currency[]> {
  return apiFetch<Currency[]>('/currencies', { token });
}

/**
 * `GET /public/currencies` — la misma lista, sin sesión: la usa el formulario
 * de registro (R18).
 */
export async function listPublicCurrencies(): Promise<Currency[]> {
  return apiFetch<Currency[]>('/public/currencies');
}
