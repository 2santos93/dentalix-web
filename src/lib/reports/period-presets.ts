/** Períodos rápidos de «Comparar sedes» (DX-014), en días civiles de la sede. */
export type PeriodPresetKey = 'this_month' | 'last_month' | 'last_30_days' | 'this_year' | 'custom';

export const PERIOD_PRESETS: readonly { key: PeriodPresetKey; label: string }[] = [
  { key: 'this_month', label: 'Este mes' },
  { key: 'last_month', label: 'Mes anterior' },
  { key: 'last_30_days', label: 'Últimos 30 días' },
  { key: 'this_year', label: 'Este año' },
  { key: 'custom', label: 'Personalizado' },
];

export interface CivilPeriod {
  from: string;
  to: string;
}

/** Como `LOCATIONS_COMPARISON_MAX_DAYS` en la API: un año, bisiesto incluido. */
export const MAX_PERIOD_DAYS = 366;

const DAY_MS = 86_400_000;

/** ¿«Desde» ≤ «Hasta» y caben como mucho 366 días (ambos incluidos)? */
export function isValidPeriod({ from, to }: CivilPeriod): boolean {
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1;
  return days >= 1 && days <= MAX_PERIOD_DAYS;
}

function iso(y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
}

/**
 * Las fechas de un atajo a partir de «hoy» (`AAAA-MM-DD` en la zona de la
 * sede). «Personalizado» no tiene: las elige quien consulta.
 */
export function periodFor(key: PeriodPresetKey, today: string): CivilPeriod | null {
  const [y, m, d] = today.split('-').map(Number);
  switch (key) {
    case 'this_month':
      return { from: iso(y, m - 1, 1), to: today };
    case 'last_month':
      return { from: iso(y, m - 2, 1), to: iso(y, m - 1, 0) };
    case 'last_30_days':
      return { from: iso(y, m - 1, d - 29), to: today };
    case 'this_year':
      return { from: iso(y, 0, 1), to: today };
    case 'custom':
      return null;
  }
}
