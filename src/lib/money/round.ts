/*
 * Redondeo de importes (DX-488-bis): el ÚNICO sitio de la web donde un importe
 * se redondea a céntimos o se escribe con `toFixed`. Espejo de
 * `dentalix-api/src/shared/money` (`roundCents`, `amountText`): la mitad hacia
 * arriba sobre `importe × 100`, igual que la API, de modo que lo que se pinta y
 * lo que se envía coinciden céntimo a céntimo. La guarda
 * `src/architecture/no-loose-money-rounding.test.ts` impide redondeos sueltos
 * fuera de aquí; los dígitos de la moneda (`roundingDigits`) los usa el
 * redondeo por línea de `line-rounding.ts`.
 */

/** Importe → céntimos enteros (la mitad hacia arriba sobre `importe × 100`). */
export function amountCents(amount: number): number {
  return Math.round(amount * 100);
}

/** Céntimos → importe. */
export function centsToAmount(cents: number): number {
  return cents / 100;
}

/** Céntimos con decimales sobrantes (una suma de `importe × 100`) → céntimos enteros. */
export function roundCents(cents: number): number {
  return Math.round(cents);
}

/** Un importe redondeado a céntimos: quita el ruido de coma flotante (0,1 + 0,2). */
export function roundAmount(amount: number): number {
  return centsToAmount(amountCents(amount));
}

/** El importe como texto con `digits` decimales fijos (el redondeo de `toFixed`). */
export function amountText(amount: number, digits: number): string {
  return amount.toFixed(digits);
}
