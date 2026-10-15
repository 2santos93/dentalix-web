/**
 * Períodos de la caja. La API recibe días civiles (`YYYY-MM-DD`, ambos
 * inclusive), igual que `paidAt` —el día en que se registró el abono—, así que
 * aquí no se habla de instantes: "hoy" es el día del reloj de quien mira la
 * caja, que es el día en que el mostrador registra los abonos.
 */

export type CashPreset = 'today' | 'week' | 'month';

export interface CashRange {
  from: string;
  to: string;
}

// Mismo tope que la API (MAX_RANGE_DAYS en ListCashPaymentsUseCase): se valida
// aquí también para no mandar una petición que se sabe que va a dar 400.
export const MAX_RANGE_DAYS = 366;

const DAY_MS = 24 * 60 * 60 * 1000;

/** El día local de `date` como `YYYY-MM-DD`. */
export function toCivilDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * El rango de un atajo, relativo a `now`. La semana va de lunes a domingo —la
 * semana laboral en LATAM—, también cuando hoy es domingo.
 */
export function presetRange(preset: CashPreset, now: Date = new Date()): CashRange {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  if (preset === 'today') {
    const today = toCivilDate(now);
    return { from: today, to: today };
  }
  if (preset === 'week') {
    // getDay(): 0 = domingo. Días desde el lunes: lunes 0 … domingo 6.
    const sinceMonday = (now.getDay() + 6) % 7;
    return {
      from: toCivilDate(new Date(y, m, d - sinceMonday)),
      to: toCivilDate(new Date(y, m, d - sinceMonday + 6)),
    };
  }
  // Día 0 del mes siguiente = último día de este.
  return {
    from: toCivilDate(new Date(y, m, 1)),
    to: toCivilDate(new Date(y, m + 1, 0)),
  };
}

/** Rango que la API aceptará: dos días, `from <= to`, como mucho 366 días. */
export function isValidRange({ from, to }: CashRange): boolean {
  const pattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!pattern.test(from) || !pattern.test(to)) return false;
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || start > end) return false;
  return Math.round((end - start) / DAY_MS) + 1 <= MAX_RANGE_DAYS;
}
