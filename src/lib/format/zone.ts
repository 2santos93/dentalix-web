import { zoneOffsetMinutes } from '@/lib/time/wall-clock';

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
