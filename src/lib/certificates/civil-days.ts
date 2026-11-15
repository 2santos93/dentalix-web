import { civilNoonUtc } from '@/lib/time/civil-day';

const DAY_MS = 24 * 60 * 60 * 1000;

/** `day` (`YYYY-MM-DD`) más `days` días civiles, sin zona: el mediodía UTC nunca cruza de día. */
export function addCivilDays(day: string, days: number): string {
  return new Date(civilNoonUtc(day).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}
