// Datos generados por `scripts/generate-country-regional.cjs` (ver su cabecera):
// moneda y zonas IANA de cada país de la lista de sedes. Solo SUGIEREN valores
// en el formulario de alta (a la vista y editables); nunca rellenan ni
// sustituyen la moneda, la zona o el formato guardados de una sede.
import countryRegional from './country-regional.json';
import type { HourCycle } from '@/lib/format/regional-format';
import { isCountryCode } from './countries';
import { browserCountry, canonicalLocale, canonicalTimeZone } from './regional-settings';

interface CountryRegionalData {
  currencies: Record<string, string>;
  /** Otras monedas de uso general en el país, además de la propuesta (`VE` → `['VES']`). */
  currencyAlternatives: Record<string, string[]>;
  zones: Record<string, string[]>;
  icuZoneCountries: Record<string, string>;
}

const DATA = countryRegional as CountryRegionalData;

/** Zona → países que la usan (también los nombres viejos que da `Intl` en algunos navegadores). */
const ZONE_COUNTRIES: ReadonlyMap<string, readonly string[]> = (() => {
  const map = new Map<string, string[]>();
  const add = (zone: string, country: string) => {
    const list = map.get(zone) ?? [];
    if (!list.includes(country)) list.push(country);
    map.set(zone, list);
  };
  for (const [country, zones] of Object.entries(DATA.zones)) for (const zone of zones) add(zone, country);
  for (const [zone, country] of Object.entries(DATA.icuZoneCountries)) add(zone, country);
  return map;
})();

/**
 * Moneda ISO 4217 de uso general en el país (`VE` → `USD`, `EC` → `USD`), para
 * proponerla al dar de alta una sede; `null` si no hay una que la API admita
 * (p. ej. las de tres decimales). Es una sugerencia: la sede puede cobrar en
 * cualquier otra.
 */
export function countryCurrency(country: string): string | null {
  return DATA.currencies[country] ?? null;
}

/**
 * Otras monedas de uso general en el país, además de `countryCurrency`, para
 * ofrecerlas con un clic en el alta (`VE` → `['VES']`: se propone USD, que es
 * en lo que trabajan sobre todo las clínicas allí, y el bolívar queda a un
 * clic). Vacío en casi todos los países. Dato, no regla: nada se elige solo.
 */
export function countryCurrencyAlternatives(country: string): readonly string[] {
  return DATA.currencyAlternatives[country] ?? [];
}

/** Zonas IANA del país, en el orden de la base de zonas (`VE` → `['America/Caracas']`). */
export function countryTimeZones(country: string): readonly string[] {
  return DATA.zones[country] ?? [];
}

/** Todas las zonas que tiene algún país de la lista, sin repetir. */
export function allCountryTimeZones(): string[] {
  return [...new Set(Object.values(DATA.zones).flat())];
}

/** El país de una zona, si es de uno solo (`America/Caracas` → `VE`); `null` si no se sabe o la comparten varios. */
export function timeZoneCountry(timeZone: string | null | undefined): string | null {
  const zone = canonicalTimeZone(timeZone) ?? timeZone?.trim();
  if (!zone) return null;
  const countries = ZONE_COUNTRIES.get(zone);
  return countries?.length === 1 ? countries[0] : null;
}

/** `true` si la zona es una de las del país. */
export function timeZoneInCountry(timeZone: string, country: string): boolean {
  const zone = canonicalTimeZone(timeZone) ?? timeZone.trim();
  return ZONE_COUNTRIES.get(zone)?.includes(country) ?? false;
}

function languageOf(tag: string | null | undefined): string | null {
  if (!tag) return null;
  try {
    return new Intl.Locale(tag).language;
  } catch {
    return null;
  }
}

function regionOf(tag: string | null | undefined): string | null {
  if (!tag) return null;
  try {
    return new Intl.Locale(tag).region ?? null;
  } catch {
    return null;
  }
}

/** Idioma más probable del país según CLDR (`VE` → `es`, `CH` → `de`). */
function countryMainLanguage(country: string): string | null {
  try {
    return new Intl.Locale(`und-${country}`).maximize().language;
  } catch {
    return null;
  }
}

/**
 * Formato regional para un país: el idioma principal del país con su región
 * (`VE` → `es-VE`); si este navegador no sabe formatear en ese idioma (`PY` →
 * guaraní), el primero de `languages` que sí (`es-PY`). `null` si ninguno.
 */
const countryLocales = new Map<string, string | null>();

export function countryLocale(country: string, languages: readonly string[] = []): string | null {
  const key = `${country}|${languages.join(',')}`;
  if (countryLocales.has(key)) return countryLocales.get(key) ?? null;
  const locale = computeCountryLocale(country, languages);
  countryLocales.set(key, locale);
  return locale;
}

function computeCountryLocale(country: string, languages: readonly string[]): string | null {
  if (!isCountryCode(country)) return null;
  const candidates = [countryMainLanguage(country), ...languages.map(languageOf)];
  for (const language of candidates) {
    if (!language) continue;
    const locale = canonicalLocale(`${language}-${country}`);
    if (locale) return locale;
  }
  return null;
}

/** Reloj por defecto de un formato regional (`es-VE` → 12 h, `es-ES` → 24 h); `null` si no lo da. */
export function localeHourCycle(locale: string | null | undefined): HourCycle | null {
  const canonical = canonicalLocale(locale);
  if (!canonical) return null;
  try {
    const { hourCycle } = new Intl.DateTimeFormat(canonical, { hour: 'numeric' }).resolvedOptions();
    if (hourCycle === 'h11' || hourCycle === 'h12') return 'h12';
    if (hourCycle === 'h23' || hourCycle === 'h24') return 'h23';
    return null;
  } catch {
    return null;
  }
}

/** Lo que el navegador dice de sí mismo; se inyecta en los tests. */
export interface BrowserRegional {
  timeZone: string | null;
  locale: string | null;
  hourCycle: HourCycle | null;
  languages: readonly string[];
}

/**
 * País que se propone al abrir el alta: el de la zona del navegador (es lo
 * que mejor dice dónde está la clínica; el idioma del navegador no: hay
 * muchos `en-US` fuera de EE. UU.), o, si la zona no es de un solo país, la
 * región explícita del idioma principal (DX-312 P1). `null` = sin propuesta.
 */
export function guessCountry(browser: Pick<BrowserRegional, 'timeZone' | 'languages'>): string | null {
  return timeZoneCountry(browser.timeZone) ?? browserCountry(browser.languages);
}

/** Valores que un país propone para los campos regionales de una sede nueva. */
export interface CountryProposal {
  currency: string | null;
  /** `null` si el país tiene varias zonas y la del navegador no es una de ellas: hay que elegir. */
  timeZone: string | null;
  locale: string | null;
  hourCycle: HourCycle | null;
}

/**
 * Lo que propone el país, coherente con el navegador cuando se puede:
 * - moneda: la del país;
 * - zona: la del navegador si es del país; si no, la única del país; con
 *   varias, ninguna (se elige);
 * - formato: el del navegador si es de ese país; si no, el del país
 *   (`countryLocale`), así un navegador `en-US` en una clínica de Alemania no
 *   propone `en-US`;
 * - reloj: el del navegador si el formato es el suyo; si no, el del formato.
 */
export function countryProposal(country: string, browser: BrowserRegional): CountryProposal {
  if (!isCountryCode(country)) return { currency: null, timeZone: null, locale: null, hourCycle: null };
  const zones = countryTimeZones(country);
  const browserZone = canonicalTimeZone(browser.timeZone);
  const timeZone =
    browserZone && timeZoneInCountry(browserZone, country) ? browserZone : zones.length === 1 ? zones[0] : null;
  const browserLocaleFits = Boolean(browser.locale) && regionOf(browser.locale) === country;
  const locale = browserLocaleFits ? browser.locale : countryLocale(country, browser.languages);
  const hourCycle = browserLocaleFits ? (browser.hourCycle ?? localeHourCycle(locale)) : localeHourCycle(locale);
  return { currency: countryCurrency(country), timeZone, locale, hourCycle };
}
