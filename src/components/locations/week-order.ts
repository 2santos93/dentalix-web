/**
 * Orden de los días de la semana según el formato regional de la sede (B6):
 * los días en `0 = domingo … 6 = sábado` (como la API), empezando por el
 * primer día de la semana de ese locale. `Intl.Locale#getWeekInfo` (o la
 * propiedad `weekInfo` de los motores que la exponen así) lo sabe; sin ella o
 * con un locale sin región, lunes (ISO 8601), que es también el orden de
 * Calendario de la sede.
 */
const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0] as const;

interface WeekInfoLocale {
  getWeekInfo?: () => { firstDay: number };
  weekInfo?: { firstDay: number };
}

/** Primer día de la semana del locale, `0 = domingo … 6 = sábado`. Lunes si no se sabe. */
export function firstWeekday(locale: string | null | undefined): number {
  if (!locale) return 1;
  try {
    const loc = new Intl.Locale(locale) as Intl.Locale & WeekInfoLocale;
    // Sin región («es») el dato no es de ningún país: lunes, como ISO.
    if (!loc.region) return 1;
    const info = typeof loc.getWeekInfo === 'function' ? loc.getWeekInfo() : loc.weekInfo;
    const first = info?.firstDay;
    // Intl: 1 = lunes … 7 = domingo.
    return typeof first === 'number' && first >= 1 && first <= 7 ? first % 7 : 1;
  } catch {
    return 1;
  }
}

/** Los siete días en el orden del locale: `[1,2,3,4,5,6,0]` (lunes) o `[0,1,…,6]` (domingo). */
export function weekOrder(locale: string | null | undefined): number[] {
  const first = firstWeekday(locale);
  if (first === 1) return [...MONDAY_FIRST];
  return Array.from({ length: 7 }, (_, i) => (first + i) % 7);
}
