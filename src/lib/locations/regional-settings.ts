import type { ClinicCountry } from '@/lib/prescriptions/prescriptions-api';
import { isUsableTimeZone } from './location-settings';

/**
 * G1 (DX-317): país, moneda, zona horaria y formato regional de una sede, tal
 * como los edita el formulario (alta, edición y registro). Vacío = sin elegir:
 * ninguno tiene valor por defecto (R1, R10) y nada se deduce del país (R2).
 */
export interface RegionalSettingsValues {
  country: ClinicCountry | '';
  currency: string;
  timeZone: string;
  locale: string;
}

export type RegionalSettingsField = keyof RegionalSettingsValues;
export type RegionalSettingsErrors = Partial<Record<RegionalSettingsField, string>>;

/** Orden de los campos en el formulario: el primer error se enfoca en este orden. */
export const REGIONAL_SETTINGS_FIELDS: readonly RegionalSettingsField[] = [
  'country',
  'currency',
  'timeZone',
  'locale',
];

/** Los mismos textos que la API (spec G1 §3.1), para que el error no cambie según quién lo detecte. */
export const regionalSettingsMessages = {
  countryMissing: 'Elige el país de la sede.',
  currencyMissing: 'Elige la moneda de la sede.',
  timeZoneMissing: 'Elige la zona horaria de la sede.',
  timeZoneUnknown: (zone: string) => `La zona horaria «${zone}» no existe.`,
  localeMissing: 'Elige el formato regional de la sede.',
  localeInvalid: (locale: string) => `El formato regional «${locale}» no es válido.`,
};

/**
 * Forma canónica BCP 47 de un formato regional (`es-mx` → `es-MX`), o `null`
 * si no es válido o este navegador no sabe formatear fechas y números con él.
 * La API aplica la misma regla.
 */
export function canonicalLocale(raw: string | null | undefined): string | null {
  const text = raw?.trim();
  if (!text) return null;
  try {
    const [canonical] = Intl.getCanonicalLocales(text);
    if (!canonical) return null;
    const dates = Intl.DateTimeFormat.supportedLocalesOf(canonical);
    const numbers = Intl.NumberFormat.supportedLocalesOf(canonical);
    return dates.length > 0 && numbers.length > 0 ? canonical : null;
  } catch {
    return null;
  }
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

/** Formato regional del navegador, canonicalizado, para sugerirlo en el alta. */
export function browserLocale(): string | null {
  if (typeof navigator === 'undefined') return null;
  return canonicalLocale(navigator.language);
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
 * Vista previa «1.234,56 · 26/10/2026 16:30» del formato regional en la zona
 * elegida, o `null` si falta alguno de los dos o no es válido.
 */
export function regionalPreview(locale: string, timeZone: string, at: Date): string | null {
  const canonical = canonicalLocale(locale);
  if (!canonical || !isUsableTimeZone(timeZone.trim())) return null;
  const number = new Intl.NumberFormat(canonical, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(1234.56);
  const date = new Intl.DateTimeFormat(canonical, {
    timeZone: timeZone.trim(),
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(at);
  return `${number} · ${date}`;
}

/** Validación en cliente con los mensajes de la API. Sin errores = `{}`. */
export function validateRegionalSettings(values: RegionalSettingsValues): RegionalSettingsErrors {
  const errors: RegionalSettingsErrors = {};
  if (values.country === '') errors.country = regionalSettingsMessages.countryMissing;
  if (values.currency.trim() === '') errors.currency = regionalSettingsMessages.currencyMissing;
  const zone = values.timeZone.trim();
  if (zone === '') errors.timeZone = regionalSettingsMessages.timeZoneMissing;
  else if (!isUsableTimeZone(zone)) errors.timeZone = regionalSettingsMessages.timeZoneUnknown(zone);
  const locale = values.locale.trim();
  if (locale === '') errors.locale = regionalSettingsMessages.localeMissing;
  else if (!canonicalLocale(locale)) errors.locale = regionalSettingsMessages.localeInvalid(locale);
  return errors;
}

function unique(values: readonly (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))];
}
