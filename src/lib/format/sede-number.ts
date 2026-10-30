import type { RegionalFormat } from '@/lib/format/regional-format';

/**
 * Lo que se pinta en lugar de un valor que depende del formato de la sede
 * mientras carga o si la sede no lo tiene (spec G1-B §10): nunca otro formato.
 */
export const NO_SEDE_FORMAT = '—';

/** Un recuento o una medida con el formato de la sede («1,234», «1.234»), o «—». */
export function sedeNumber(value: number, fmt: RegionalFormat | null): string {
  return fmt ? fmt.number(value) : NO_SEDE_FORMAT;
}

/** Un importe con el formato de la sede (DX-378), o «—» sin él. */
export function sedeMoney(amount: number, currency: string, fmt: RegionalFormat | null): string {
  return fmt ? fmt.money(amount, currency) : NO_SEDE_FORMAT;
}

/** Un día civil `YYYY-MM-DD` con el formato de la sede (DX-378), o «—» sin él. */
export function sedeCivilDate(day: string, fmt: RegionalFormat | null): string {
  return fmt ? fmt.civilDate(day) : NO_SEDE_FORMAT;
}
