import { zoneOffsetMinutes } from '@/lib/time/wall-clock';
// Nombre en español de las ciudades de zona que no se escriben igual que en su
// id IANA («Bogotá», «Ciudad de México»). Es solo un rótulo: ninguna zona se
// elige ni se sustituye por esta tabla.
import zoneCityNamesEs from './zone-city-names-es.json';

/** Signo menos tipográfico (U+2212), no el guion: «UTC−5». */
const MINUS = '−';

/**
 * Desfase de `timeZone` en ese instante, para decir en qué zona va una hora
 * (DX-362): «UTC−5», «UTC+2», «UTC+5:30», «UTC». Sigue el horario de verano y
 * no depende del locale (una abreviatura como «CET» no existe en todas las
 * zonas ni en todos los idiomas; el desfase, sí).
 */
export function utcOffsetLabel(instant: Date, timeZone: string): string {
  const offset = zoneOffsetMinutes(instant, timeZone);
  if (offset === 0) return 'UTC';
  const abs = Math.abs(offset);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  const sign = offset < 0 ? MINUS : '+';
  return `UTC${sign}${hours}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''}`;
}

const CITY_NAMES: Readonly<Record<string, string>> = zoneCityNamesEs;

/**
 * Ciudad de una zona IANA para rótulos: «Caracas» para `America/Caracas`,
 * «Ciudad de México» para `America/Mexico_City`, «Buenos Aires» para
 * `America/Argentina/Buenos_Aires`; `UTC` y `Etc/…` se quedan tal cual.
 */
export function zoneCityName(timeZone: string): string {
  const named = CITY_NAMES[timeZone];
  if (named) return named;
  if (!timeZone.includes('/') || timeZone.startsWith('Etc/')) return timeZone;
  return (timeZone.split('/').pop() ?? timeZone).replace(/_/g, ' ');
}

/**
 * Zona legible con su desfase en ese instante: «Caracas (UTC−4)». Para la
 * nota de los días de una pantalla y el resumen de la sede.
 */
export function zoneShortLabel(timeZone: string, at: Date = new Date()): string {
  const city = zoneCityName(timeZone);
  let offset: string | null = null;
  try {
    offset = utcOffsetLabel(at, timeZone);
  } catch {
    offset = null;
  }
  return offset && offset !== city ? `${city} (${offset})` : city;
}
