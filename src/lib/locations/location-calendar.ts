import type { RegionalFormat } from '@/lib/format/regional-format';
import type { ClinicRole } from '@/lib/me/me-api';
import type { LocationHoliday } from './location-calendar-api';

/**
 * DX-316 (spec §7.3): lógica pura de la pantalla «Calendario de la sede».
 * Días 0 = domingo … 6 = sábado, como la API. Los nombres de los días y los
 * meses salen siempre de `fmt` (UI_LANGUAGE), nunca de una tabla propia (I6).
 */

/** La semana se pinta de lunes a domingo (ISO 8601) en todas las sedes (R12). */
export const ISO_WEEK_ORDER: readonly number[] = [1, 2, 3, 4, 5, 6, 0];

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Resumen de los días hábiles: «Todos los días», un tramo seguido de 3 o más
 * días como «Lunes a viernes» (también si cruza el domingo: «Viernes a
 * lunes»), y si no, la lista en orden ISO: «Lunes, miércoles y viernes».
 * RangeError con la semana vacía o un día fuera de 0–6.
 */
export function describeWorkingWeekdays(days: readonly number[], fmt: RegionalFormat): string {
  const set = new Set(days);
  if (set.size === 0 || [...set].some((d) => !ISO_WEEK_ORDER.includes(d))) {
    throw new RangeError(`Días hábiles no válidos: ${days.join(',')}`);
  }
  if (set.size === 7) return 'Todos los días';
  // Un único tramo circular empieza en el día cuyo anterior no es hábil.
  const starts = [...set].filter((d) => !set.has((d + 6) % 7));
  if (starts.length === 1 && set.size >= 3) {
    const first = starts[0];
    const last = (first + set.size - 1) % 7;
    return `${capitalize(fmt.weekdayName(first))} a ${fmt.weekdayName(last)}`;
  }
  const names = ISO_WEEK_ORDER.filter((d) => set.has(d)).map((d) => fmt.weekdayName(d));
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
  return capitalize(list);
}

/** Festivo recurrente: día y mes, sin el año guardado (R6): '2020-05-03' → «3 de mayo». */
export function recurringLabel(date: string, fmt: RegionalFormat): string {
  return fmt.civilLongDate(date, { weekday: false, year: false });
}

function byDateThenId(a: LocationHoliday, b: LocationHoliday): number {
  return a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
}

function byMonthDayThenId(a: LocationHoliday, b: LocationHoliday): number {
  return a.date.slice(5).localeCompare(b.date.slice(5)) || a.id.localeCompare(b.id);
}

/** Recurrentes por mes y día; puntuales agrupados por año ascendente y, dentro, por fecha. */
export function groupHolidays(h: readonly LocationHoliday[]): {
  recurring: LocationHoliday[];
  years: { year: number; items: LocationHoliday[] }[];
} {
  const recurring = h.filter((x) => x.recurring).sort(byMonthDayThenId);
  const years: { year: number; items: LocationHoliday[] }[] = [];
  for (const item of h.filter((x) => !x.recurring).sort(byDateThenId)) {
    const year = Number(item.date.slice(0, 4));
    const last = years[years.length - 1];
    if (last?.year === year) last.items.push(item);
    else years.push({ year, items: [item] });
  }
  return { recurring, years };
}

/** Igual que la API (R9): solo ADMIN lee y cambia el calendario de la sede. */
export function canManageLocationCalendar(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/** Textos con número de la importación (spec §7.2, M13), con singular; cifras con el formato de la sede. */
export const importCopy = {
  newRows: (n: number, fmt: RegionalFormat) => (n === 1 ? '1 nuevo' : `${fmt.number(n)} nuevos`),
  duplicateRows: (n: number, fmt: RegionalFormat) => (n === 1 ? '1 ya existía' : `${fmt.number(n)} ya existían`),
  errorRows: (n: number, fmt: RegionalFormat) => (n === 1 ? '1 con error' : `${fmt.number(n)} con errores`),
  importButton: (n: number, fmt: RegionalFormat) => (n === 1 ? 'Importar 1 festivo' : `Importar ${fmt.number(n)} festivos`),
  imported: (n: number, fmt: RegionalFormat) => (n === 1 ? 'Importado 1 festivo' : `Importados ${fmt.number(n)} festivos`),
  /** Las partes del resumen se unen con « · ». */
  separator: ' · ',
} as const;
