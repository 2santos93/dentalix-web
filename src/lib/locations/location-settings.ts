import { civilDateInZone } from '@/lib/format/date';
import type { ClinicLocation } from './locations-api';

/**
 * Moneda, zona y formato de una sede (GLOBAL-G1). Son datos de la sede y
 * nada más: aquí no se deducen del país ni se rellenan con un valor por
 * defecto (R2, R5). Sin dato válido, `null`, y quien lo usa muestra
 * `SedeConfigError`.
 */

const CURRENCY_CODE = /^[A-Z]{3}$/;

/** Moneda ISO 4217 de la sede, o `null` si no la tiene (sede sin configurar). */
export function locationCurrency(location: Pick<ClinicLocation, 'currency'> | null | undefined): string | null {
  const code = location?.currency;
  return code && CURRENCY_CODE.test(code) ? code : null;
}

/** `true` si este navegador entiende la zona IANA. */
export function isUsableTimeZone(timeZone: string | null | undefined): timeZone is string {
  return Boolean(timeZone) && civilDateInZone(new Date(), timeZone as string) !== null;
}

/**
 * Zona IANA de la sede, o `null` si no la tiene o este navegador no la
 * reconoce. Nunca otra zona en su lugar.
 */
export function locationTimeZone(location: Pick<ClinicLocation, 'timeZone'> | null | undefined): string | null {
  const zone = location?.timeZone;
  return isUsableTimeZone(zone) ? zone : null;
}

/**
 * La moneda común de las sedes ACTIVAS de la clínica, o `null` si no hay sedes
 * activas, si no comparten moneda o si alguna no tiene moneda (no se puede
 * saber cuál sería la común). Es para datos de toda la clínica, como el
 * catálogo: `defaultPrice` no lleva moneda, así que con sedes en monedas
 * distintas no se sabe en cuál está, y la sede elegida en el selector no lo
 * decide. Sin moneda, el importe va sin símbolo.
 */
export function clinicBaseCurrency(locations: readonly ClinicLocation[]): string | null {
  const active = locations.filter((l) => l.isActive);
  const currencies = active.map(locationCurrency);
  if (currencies.length === 0 || currencies.some((c) => c === null)) return null;
  const distinct = new Set(currencies);
  return distinct.size === 1 ? [...distinct][0] : null;
}
