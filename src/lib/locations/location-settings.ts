import { civilDateInZone } from '@/lib/format/date';
import { regionalFormat, type RegionalFormat, type RegionalSettingsForFormat } from '@/lib/format/regional-format';
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
 * Formato regional y reloj de la sede (G1-B), o `null` si le falta alguno o
 * este navegador no sabe formatear con ellos. Nunca otro valor en su lugar: ni
 * el del navegador, ni el de otra sede, ni uno deducido del país (spec §10).
 */
export function locationFormat(
  location: Pick<ClinicLocation, 'locale' | 'hourCycle'> | null | undefined,
): RegionalSettingsForFormat | null {
  const locale = location?.locale;
  const hourCycle = location?.hourCycle;
  if (!locale || !hourCycle) return null;
  try {
    regionalFormat({ locale, hourCycle });
  } catch {
    return null;
  }
  return { locale, hourCycle };
}

/** El helper de formato con los ajustes de la sede, o `null` en los mismos casos que {@link locationFormat}. */
export function locationRegionalFormat(
  location: Pick<ClinicLocation, 'locale' | 'hourCycle'> | null | undefined,
): RegionalFormat | null {
  const settings = locationFormat(location);
  return settings ? regionalFormat(settings) : null;
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

/**
 * La moneda que toca a lo nuevo que se crea o se consulta «en la sede» (un plan,
 * el panel): con una sede activa, la suya; en «Todas las sedes» (o con una sede
 * activa que ya no está en la lista), la común de la clínica.
 * - `scope: 'sede'` con `currency: null`: la sede activa no tiene moneda (sin
 *   configurar). Quien la usa muestra `SedeConfigError`.
 * - `scope: 'clinic'` con `currency: null`: no hay una moneda común. El campo
 *   queda vacío y hay que elegirla.
 * Nunca otra moneda en su lugar (R5, R14).
 */
export function activeSedeCurrency(
  locations: readonly ClinicLocation[],
  activeLocationId: string | null,
): { scope: 'sede' | 'clinic'; currency: string | null } {
  const active = activeLocationId ? locations.find((l) => l.id === activeLocationId) : undefined;
  return active
    ? { scope: 'sede', currency: locationCurrency(active) }
    : { scope: 'clinic', currency: clinicBaseCurrency(locations) };
}

/** `true` si alguna sede activa no tiene moneda (sin configurar). */
export function hasActiveLocationWithoutCurrency(locations: readonly ClinicLocation[]): boolean {
  return locations.some((l) => l.isActive && locationCurrency(l) === null);
}
