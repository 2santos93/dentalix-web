import { regionalFormat, type HourCycle } from '@/lib/format/regional-format';
import { isCountryCode } from './countries';
// Copia byte a byte de `prisma/reference/iana-zone-names.json` de la API: no se edita aquí.
// La fuente es la API; `scripts/check-api-reference-sync.mjs` (CI) falla si
// divergen. Ver src/lib/money/README.md.
import ianaZoneNames from './iana-zone-names.json';
import { isUsableTimeZone } from './location-settings';

/**
 * G1 (DX-317): país, moneda, zona horaria y formato regional de una sede, tal
 * como los edita el formulario (alta, edición y registro); G1-B (DX-350) añade
 * su reloj. Vacío = sin elegir: ninguno tiene valor por defecto (R1, R10) y
 * nada se deduce del país (R2) ni el reloj del formato.
 */
export interface RegionalSettingsValues {
  /** Código ISO 3166-1 alfa-2 de la lista de países (DX-312); `''` = sin elegir. */
  country: string;
  currency: string;
  timeZone: string;
  locale: string;
  hourCycle: HourCycle | '';
}

export type RegionalSettingsField = keyof RegionalSettingsValues;
export type RegionalSettingsErrors = Partial<Record<RegionalSettingsField, string>>;

/** Orden de los campos en el formulario: el primer error se enfoca en este orden. */
export const REGIONAL_SETTINGS_FIELDS: readonly RegionalSettingsField[] = [
  'country',
  'currency',
  'timeZone',
  'locale',
  'hourCycle',
];

/** Cómo se nombra cada reloj en pantalla (opciones del campo, lista de sedes, aviso). */
export const HOUR_CYCLE_LABELS: Record<HourCycle, string> = { h12: '12 h', h23: '24 h' };

/** `true` si es uno de los dos relojes que admite la API. */
export function isHourCycle(value: unknown): value is HourCycle {
  return value === 'h12' || value === 'h23';
}

/** Los mismos textos que la API (spec G1 §3.1, G1-B §4.1), para que el error no cambie según quién lo detecte. */
export const regionalSettingsMessages = {
  countryMissing: 'Elige el país de la sede.',
  countryUnknown: (code: string) => `El país «${code}» no está en la lista de países.`,
  currencyMissing: 'Elige la moneda de la sede.',
  timeZoneMissing: 'Elige la zona horaria de la sede.',
  timeZoneUnknown: (zone: string) => `La zona horaria «${zone}» no existe.`,
  localeMissing: 'Elige el formato regional de la sede.',
  localeInvalid: (locale: string) => `El formato regional «${locale}» no es válido.`,
  hourCycleMissing: 'Elige el reloj de la sede: 12 h o 24 h.',
  hourCycleInvalid: (hourCycle: string) => `El reloj «${hourCycle}» no es válido: elige 12 h o 24 h.`,
};

/**
 * G1-B (spec §3.2): quita la palabra clave `hc` de la extensión Unicode de una
 * etiqueta ya canónica (`en-US-u-hc-h12` → `en-US`): el reloj tiene su propio
 * campo y no puede haber dos fuentes. Las demás palabras clave se conservan, y
 * una extensión `-u-` que se queda vacía desaparece. La API aplica la misma regla.
 */
function withoutHourCycleKeyword(canonical: string): string {
  const subtags = canonical.split('-');
  // En la forma canónica la extensión privada `-x-` va al final: una `u`
  // detrás de ella no es la extensión Unicode.
  const privateUse = subtags.indexOf('x');
  const u = subtags.indexOf('u');
  if (u < 0 || (privateUse >= 0 && privateUse < u)) return canonical;
  let end = u + 1;
  while (end < subtags.length && subtags[end].length > 1) end++;
  const kept: string[] = [];
  let skipping = false;
  for (const subtag of subtags.slice(u + 1, end)) {
    // Clave = 2 caracteres; sus tipos (3-8) la siguen hasta la próxima clave.
    if (subtag.length === 2) skipping = subtag === 'hc';
    if (!skipping) kept.push(subtag);
  }
  const extension = kept.length > 0 ? ['u', ...kept] : [];
  return [...subtags.slice(0, u), ...extension, ...subtags.slice(end)].join('-');
}

/**
 * Forma canónica BCP 47 de un formato regional (`es-mx` → `es-MX`), sin la
 * palabra clave `hc` (G1-B), o `null` si no es válido o este navegador no sabe
 * formatear fechas y números con él. La API aplica la misma regla.
 */
export function canonicalLocale(raw: string | null | undefined): string | null {
  const text = raw?.trim();
  if (!text) return null;
  try {
    const [tag] = Intl.getCanonicalLocales(text);
    if (!tag) return null;
    const canonical = withoutHourCycleKeyword(tag);
    const dates = Intl.DateTimeFormat.supportedLocalesOf(canonical);
    const numbers = Intl.NumberFormat.supportedLocalesOf(canonical);
    return dates.length > 0 && numbers.length > 0 ? canonical : null;
  } catch {
    return null;
  }
}

/** Nombres IANA (zonas y enlaces) por su minúscula: copia byte a byte de la lista de la API (spec G1-B §7–§8). */
const ZONES_BY_LOWER_CASE: ReadonlyMap<string, string> = new Map(
  (ianaZoneNames as string[]).map((zone) => [zone.toLowerCase(), zone]),
);

/**
 * La zona IANA con su mayúscula canónica (`asia/kolkata` → `Asia/Kolkata`), o
 * `null` si este navegador no la reconoce o no está en la lista. Solo corrige
 * la CAPITALIZACIÓN, contra la lista compartida con la API: nunca
 * `resolvedOptions().timeZone`, que en V8 (Chrome, Node) reescribe los enlaces
 * a su nombre viejo de ICU (`Asia/Kolkata` → `Asia/Calcutta`), y nunca cambia
 * un enlace por su destino ni al revés. Lo enviado y lo comparado con la zona
 * guardada es siempre esta forma.
 */
export function canonicalTimeZone(raw: string | null | undefined): string | null {
  const text = raw?.trim();
  if (!text || !isUsableTimeZone(text)) return null;
  return ZONES_BY_LOWER_CASE.get(text.toLowerCase()) ?? null;
}

/** Zona del navegador, para sugerirla en el alta; `null` si no la da o no es válida. */
export function browserTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isUsableTimeZone(zone) ? zone : null;
  } catch {
    return null;
  }
}

/**
 * Formato regional del navegador para sugerirlo en el alta y el registro
 * (spec G1-B §9): el locale con el que `Intl` formatea aquí, canonicalizado y
 * sin `hc`. `intl` se inyecta en los tests; en el servidor no hay navegador.
 */
export function browserLocale(intl: typeof Intl = Intl): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return canonicalLocale(new intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    return null;
  }
}

/**
 * Reloj del navegador para sugerirlo (spec G1-B §9): `h11`/`h12` → `h12`,
 * `h23`/`h24` → `h23`; `null` si no lo da (el campo empieza vacío). Hay que
 * pedir `hour`: sin ese campo `resolvedOptions()` no trae `hourCycle`.
 */
export function browserHourCycle(intl: typeof Intl = Intl): HourCycle | null {
  if (typeof window === 'undefined') return null;
  try {
    const { hourCycle } = new intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions();
    if (hourCycle === 'h11' || hourCycle === 'h12') return 'h12';
    if (hourCycle === 'h23' || hourCycle === 'h24') return 'h23';
    return null;
  } catch {
    return null;
  }
}

/** Los formatos que el navegador declara (`navigator.languages`), canonicalizados y sin repetir. */
export function browserLocales(): string[] {
  if (typeof navigator === 'undefined') return [];
  const raw = navigator.languages?.length ? navigator.languages : [navigator.language];
  return unique(raw.map((l) => canonicalLocale(l)));
}

/**
 * Zonas que ofrece el buscador: las IANA del navegador más `extra` (el valor
 * actual de la sede y la sugerencia), que se ofrecen aunque el navegador no
 * las liste —p. ej. `UTC`—, para no perder nunca el valor guardado.
 */
export function timeZoneOptions(extra: readonly (string | null | undefined)[] = []): string[] {
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf('timeZone');
  } catch {
    zones = [];
  }
  return unique([...extra, ...zones]);
}

/**
 * Vista previa «12.345,67 · 26.10.2026 16:30» (cinco cifras: con cuatro, `es`
 * no agrupa y «1234,56» parecería un separador perdido) con el helper de
 * formato, en la zona y con el reloj elegidos. Sin reloj elegido (o con uno
 * guardado que no es h12/h23), la fecha va sin hora: nunca un reloj deducido
 * del formato ni uno de reserva. `null` si falta el formato o la zona, o
 * alguno no es válido.
 */
export function regionalPreview(locale: string, timeZone: string, hourCycle: string, at: Date): string | null {
  const canonical = canonicalLocale(locale);
  const zone = timeZone.trim();
  if (!canonical || !isUsableTimeZone(zone)) return null;
  if (isHourCycle(hourCycle)) {
    const fmt = regionalFormat({ locale: canonical, hourCycle });
    return `${fmt.number(12345.67, { min: 2, max: 2 })} · ${fmt.dateTime(at, zone)}`;
  }
  // Sin reloj válido no se pinta ninguna hora. Fecha y número no dependen del
  // reloj: salen iguales con cualquiera de los dos, así que se piden con cada
  // uno y solo se pinta lo que coincide (nunca se elige uno por la sede).
  const [first, ...rest] = (Object.keys(HOUR_CYCLE_LABELS) as HourCycle[]).map((cycle) => {
    const fmt = regionalFormat({ locale: canonical, hourCycle: cycle });
    return `${fmt.number(12345.67, { min: 2, max: 2 })} · ${fmt.date(at, zone)}`;
  });
  return rest.every((text) => text === first) ? first : null;
}

/**
 * La hora de `at` en la zona elegida con cada reloj, para el ejemplo de cada
 * opción del campo «Reloj» («3:05 p. m.» / «15:05»), o `null` si falta el
 * formato o la zona, o alguno no es válido.
 */
export function hourCycleExamples(locale: string, timeZone: string, at: Date): Record<HourCycle, string> | null {
  const canonical = canonicalLocale(locale);
  const zone = timeZone.trim();
  if (!canonical || !isUsableTimeZone(zone)) return null;
  const example = (hourCycle: HourCycle) => regionalFormat({ locale: canonical, hourCycle }).time(at, zone);
  return { h12: example('h12'), h23: example('h23') };
}

/** Validación en cliente con los mensajes de la API. Sin errores = `{}`. */
export function validateRegionalSettings(values: RegionalSettingsValues): RegionalSettingsErrors {
  const errors: RegionalSettingsErrors = {};
  if (values.country === '') errors.country = regionalSettingsMessages.countryMissing;
  else if (!isCountryCode(values.country)) errors.country = regionalSettingsMessages.countryUnknown(values.country);
  if (values.currency.trim() === '') errors.currency = regionalSettingsMessages.currencyMissing;
  const zone = values.timeZone.trim();
  if (zone === '') errors.timeZone = regionalSettingsMessages.timeZoneMissing;
  else if (!isUsableTimeZone(zone)) errors.timeZone = regionalSettingsMessages.timeZoneUnknown(zone);
  const locale = values.locale.trim();
  if (locale === '') errors.locale = regionalSettingsMessages.localeMissing;
  else if (!canonicalLocale(locale)) errors.locale = regionalSettingsMessages.localeInvalid(locale);
  if (values.hourCycle === '') errors.hourCycle = regionalSettingsMessages.hourCycleMissing;
  else if (!isHourCycle(values.hourCycle)) errors.hourCycle = regionalSettingsMessages.hourCycleInvalid(values.hourCycle);
  return errors;
}

/** Sin vacíos ni repetidos, en el orden de llegada. */
export function unique(values: readonly (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))];
}
