import { UI_LANGUAGE } from '@/lib/format/regional-format';
import { utcOffsetLabel, zoneCityName } from '@/lib/format/zone';
import { zoneOffsetMinutes } from '@/lib/time/wall-clock';
import { COUNTRIES, countryName, countrySearchKey } from './countries';
import { allCountryTimeZones, countryLocale, countryTimeZones, timeZoneCountry } from './country-regional';
import { canonicalLocale, canonicalTimeZone, regionalPreview, unique } from './regional-settings';
import { isUsableTimeZone } from './location-settings';

/**
 * Opciones legibles de zona y formato regional para los combobox de la sede:
 * «(UTC+9) Tokio — Japón» en vez de `Asia/Tokyo`, y
 * «Japonés (Japón) — 12,345.67 · 2026/10/31» en vez de `ja-JP`. El valor
 * que se guarda sigue siendo el id IANA / la etiqueta BCP 47.
 */
export interface RegionalOption {
  /** Valor guardado: id IANA o etiqueta BCP 47. */
  code: string;
  /** Texto de la opción y del campo. */
  name: string;
}

interface SearchableOption extends RegionalOption {
  key: string;
}

const MINUS = '−';

/**
 * Cachés por proceso: los nombres no cambian dentro de la misma hora (el
 * desfase puede cambiar con el horario de verano) ni del mismo día (la fecha
 * de ejemplo del formato). Formatear con `Intl` cientos de opciones en cada
 * render sería lento.
 */
const zoneLabels = new Map<string, string>();
const zoneOffsets = new Map<string, number>();
const localeLabels = new Map<string, string>();
const BY_NAME = new Intl.Collator(UI_LANGUAGE);
const hourKey = (at: Date) => at.toISOString().slice(0, 13);
const dayKey = (at: Date) => at.toISOString().slice(0, 10);

function cached<V>(cache: Map<string, V>, key: string, compute: () => V): V {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const value = compute();
  if (cache.size > 5000) cache.clear();
  cache.set(key, value);
  return value;
}

/** «(UTC+9) Tokio — Japón»; sin país si la ciudad ya se llama como él («(UTC−5) Panamá»). */
export function timeZoneLabel(timeZone: string, at: Date = new Date()): string {
  return cached(zoneLabels, `${timeZone}|${hourKey(at)}`, () => computeTimeZoneLabel(timeZone, at));
}

function computeTimeZoneLabel(timeZone: string, at: Date): string {
  const city = zoneCityName(timeZone);
  let offset = '';
  try {
    offset = utcOffsetLabel(at, timeZone);
  } catch {
    return timeZone;
  }
  const country = countryName(timeZoneCountry(timeZone));
  const place = country && countrySearchKey(country) !== countrySearchKey(city) ? `${city} — ${country}` : city;
  return offset === city ? city : `(${offset}) ${place}`;
}

function offsetOf(timeZone: string, at: Date): number {
  return cached(zoneOffsets, `${timeZone}|${hourKey(at)}`, () => {
    try {
      return zoneOffsetMinutes(at, timeZone);
    } catch {
      return 0;
    }
  });
}

/** Claves de búsqueda por lista (las listas del formulario se memorizan). */
const searchKeys = new WeakMap<readonly RegionalOption[], SearchableOption[]>();

function withKey(option: RegionalOption): SearchableOption {
  // El id también se busca («america/caracas», «utc-4» con guion normal).
  return { ...option, key: countrySearchKey(`${option.name} ${option.code}`.replaceAll(MINUS, '-')) };
}

/**
 * Las zonas para elegir: primero las del país de la sede, luego todas las
 * demás, cada grupo de oeste a este. `extra` (la guardada, la sugerida) se
 * ofrece siempre aunque no sea de ningún país, para no perder un valor.
 */
export function timeZoneChoices(
  country: string,
  extra: readonly (string | null | undefined)[] = [],
  at: Date = new Date(),
): RegionalOption[] {
  const byOffset = (zones: string[]) =>
    zones
      .map((code) => ({ code, offset: offsetOf(code, at), name: timeZoneLabel(code, at) }))
      .sort((a, b) => a.offset - b.offset || BY_NAME.compare(a.name, b.name))
      .map(({ code, name }) => ({ code, name }));
  const own = unique([...countryTimeZones(country)]);
  const extras = unique(extra.map((z) => canonicalTimeZone(z) ?? z?.trim())).filter(
    (z) => !own.includes(z) && isUsableTimeZone(z),
  );
  const rest = unique(['UTC', ...allCountryTimeZones()]).filter((z) => !own.includes(z) && !extras.includes(z));
  return [...byOffset(own), ...byOffset([...extras, ...rest])];
}

const languageNames = (() => {
  try {
    return new Intl.DisplayNames(UI_LANGUAGE, { type: 'language', languageDisplay: 'standard' });
  } catch {
    return null;
  }
})();

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase(UI_LANGUAGE) + text.slice(1);
}

/** Nombre del formato en español: «Japonés (Japón)»; la etiqueta tal cual si no hay nombre. */
export function localeName(locale: string): string {
  try {
    const name = languageNames?.of(locale);
    return name && name !== locale ? capitalize(name) : locale;
  } catch {
    return locale;
  }
}

/** «Japonés (Japón) — 12,345.67 · 2026/10/31»: el nombre y cómo escribe números y fechas. */
export function localeLabel(locale: string, at: Date = new Date()): string {
  return cached(localeLabels, `${locale}|${dayKey(at)}`, () => computeLocaleLabel(locale, at));
}

function computeLocaleLabel(locale: string, at: Date): string {
  const canonical = canonicalLocale(locale) ?? locale;
  // Sin reloj ni zona de la sede: solo número y fecha, en UTC (el día no importa).
  const sample = regionalPreview(canonical, 'UTC', '', at);
  return sample ? `${localeName(canonical)} — ${sample}` : localeName(canonical);
}

/**
 * Los formatos para elegir: `extra` (el guardado, el sugerido), los del país
 * de la sede (`countryLocale` con los idiomas del navegador) y los del
 * navegador; después, uno por país de la lista, por nombre. Solo etiquetas
 * con las que este navegador sabe formatear.
 */
export function localeChoices(
  country: string,
  extra: readonly (string | null | undefined)[] = [],
  languages: readonly string[] = [],
  at: Date = new Date(),
): RegionalOption[] {
  const ownLanguages = unique(languages.map((l) => languageOfTag(l)));
  const first = unique([
    ...extra.map((l) => canonicalLocale(l) ?? l?.trim()),
    country ? countryLocale(country, languages) : null,
    ...(country ? ownLanguages.map((language) => canonicalLocale(`${language}-${country}`)) : []),
    ...languages.map((l) => canonicalLocale(l)),
  ]);
  const rest = unique(COUNTRIES.map((c) => countryLocale(c.code, languages))).filter((l) => !first.includes(l));
  const label = (code: string) => ({ code, name: localeLabel(code, at) });
  return [
    ...first.map(label),
    ...rest.map(label).sort((a, b) => BY_NAME.compare(a.name, b.name)),
  ];
}

function languageOfTag(tag: string): string | null {
  try {
    return new Intl.Locale(tag).language;
  } catch {
    return null;
  }
}

/**
 * Busca en las opciones por su texto o su valor, sin tildes ni mayúsculas: el
 * valor exacto primero, luego los que empiezan por lo escrito, luego los que
 * lo contienen. Sin consulta, todas en su orden.
 */
export function searchRegionalOptions(options: readonly RegionalOption[], query: string): RegionalOption[] {
  const key = countrySearchKey(query.replaceAll(MINUS, '-'));
  if (key === '') return [...options];
  let keyed = searchKeys.get(options);
  if (!keyed) {
    keyed = options.map(withKey);
    searchKeys.set(options, keyed);
  }
  const exact = keyed.find((o) => o.code.toLowerCase() === key);
  const rest = keyed.filter((o) => o !== exact);
  const words = (o: SearchableOption) => o.key.split(/[\s()—·,/_-]+/);
  const pick = ({ code, name }: SearchableOption): RegionalOption => ({ code, name });
  return [
    ...(exact ? [exact] : []),
    ...rest.filter((o) => o.key.startsWith(key) || words(o).some((w) => w.startsWith(key))),
    ...rest.filter((o) => !o.key.startsWith(key) && !words(o).some((w) => w.startsWith(key)) && o.key.includes(key)),
  ].map(pick);
}
