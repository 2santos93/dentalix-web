import { civilDateInZone } from '@/lib/format/date';
import { civilNoonUtc } from '@/lib/time/civil-day';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Días civiles de la sede desde la emisión hasta hoy (0 = hoy), como el
 * `ageDays` de `/external-orders/pending` (DX-572). Sin zona, null: nunca se
 * cuenta con el día del navegador.
 */
export function externalOrderAgeDays(issuedAt: string, timeZone: string | null, now: Date = new Date()): number | null {
  if (!timeZone) return null;
  const issuedDay = civilDateInZone(issuedAt, timeZone);
  const today = civilDateInZone(now, timeZone);
  if (!issuedDay || !today) return null;
  return Math.max(0, Math.round((civilNoonUtc(today).getTime() - civilNoonUtc(issuedDay).getTime()) / DAY_MS));
}

/** «Hoy», «1 día», «12 días». */
export function externalOrderAgeLabel(days: number): string {
  if (days === 0) return 'Hoy';
  return days === 1 ? '1 día' : `${days} días`;
}
