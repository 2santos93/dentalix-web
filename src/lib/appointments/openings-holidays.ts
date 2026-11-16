import type { Openings } from '@/lib/appointments/waitlist-api';
import { civilDateLabel } from '@/lib/format/date';

export type OpeningsHoliday = Openings['holidays'][number];

function dayLabel(day: string): string {
  return civilDateLabel(day, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/**
 * DX-263-bis: por qué «Buscar hueco» no ofrece ciertos días del rango: la
 * sede cierra por festivo (DX-316). `null` si no hay ninguno. Los días van
 * con su nombre para que la recepción no los busque a mano.
 */
export function openingsHolidaysNote(
  holidays: readonly OpeningsHoliday[] | undefined,
): string | null {
  if (!holidays || holidays.length === 0) return null;
  const days = holidays.map((h) => `el ${dayLabel(h.date)} (${h.name})`);
  const list =
    days.length === 1
      ? days[0]
      : `${days.slice(0, -1).join(', ')} y ${days[days.length - 1]}`;
  return `La sede cierra por festivo ${list}: ${days.length === 1 ? 'ese día' : 'esos días'} no hay huecos.`;
}
