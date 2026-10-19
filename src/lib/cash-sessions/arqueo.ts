import type { PaymentMethod } from '@/lib/payments/payments-api';
import { PAYMENT_METHOD_OPTIONS } from '@/lib/payments/payment-method';
import type { CashAdjustmentKind, CashExpectedLine } from './cash-sessions-api';

/*
 * El arqueo en pantalla (DX-027): las filas que se cuentan al cerrar y la
 * diferencia en vivo. La API vuelve a calcular el esperado con la caja
 * bloqueada y es la que decide; esto solo guía a quien cuenta. Importes en
 * céntimos enteros para que la resta no arrastre decimales del coma flotante.
 */

export interface CountRow {
  currency: string;
  method: PaymentMethod;
  /** `null` con arqueo ciego: quien cuenta aún no ve el esperado. */
  expected: number | null;
  /** Lo escrito en el campo, tal cual. */
  counted: string;
}

export const ADJUSTMENT_KIND_LABELS: Record<CashAdjustmentKind, string> = {
  VOID: 'Anulación posterior al cierre',
  LATE_PAYMENT: 'Abono con fecha de un día cerrado',
  CORRECTION: 'Corrección de un cierre',
};

const cents = (amount: number) => Math.round(amount * 100);

/**
 * Las filas del arqueo. Con el esperado a la vista, una por cada par
 * (moneda, método) que tiene algo esperado. Con arqueo ciego no se sabe qué
 * pares hay: los cuatro métodos de cada moneda del fondo (o de la moneda de
 * la clínica), todos en blanco; lo que no se cuente va como 0.
 */
export function countRows(
  expected: readonly CashExpectedLine[] | null,
  blindCurrencies: readonly string[],
): CountRow[] {
  if (expected) {
    return expected.map((line) => ({
      currency: line.currency,
      method: line.method,
      expected: line.expected,
      counted: '',
    }));
  }
  return [...new Set(blindCurrencies)].sort().flatMap((currency) =>
    PAYMENT_METHOD_OPTIONS.map((method) => ({ currency, method, expected: null, counted: '' })),
  );
}

/**
 * Importe escrito en un campo: `null` si está vacío o no es un importe válido
 * (≥ 0 y como mucho 2 decimales). Acepta coma decimal («1500,50»).
 */
export function parseCounted(value: string): number | null {
  const text = value.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  return Number(text);
}

/** Diferencia (contado − esperado) de una fila, o `null` si aún no se puede saber. */
export function rowDifference(row: CountRow): number | null {
  if (row.expected === null) return null;
  const counted = row.counted.trim() === '' ? 0 : parseCounted(row.counted);
  if (counted === null) return null;
  return (cents(counted) - cents(row.expected)) / 100;
}

/** ¿Hay alguna fila que no cuadra? (solo con el esperado a la vista) */
export function hasDifference(rows: readonly CountRow[]): boolean {
  return rows.some((row) => {
    const diff = rowDifference(row);
    return diff !== null && diff !== 0;
  });
}

/** Filas con un importe que no se entiende (para avisar antes de enviar). */
export function invalidRows(rows: readonly CountRow[]): CountRow[] {
  return rows.filter((row) => row.counted.trim() !== '' && parseCounted(row.counted) === null);
}

/** El cuerpo del cierre: solo las filas con algo escrito (lo vacío es 0). */
export function countsPayload(rows: readonly CountRow[]): { currency: string; method: PaymentMethod; counted: number }[] {
  return rows.flatMap((row) => {
    const counted = parseCounted(row.counted);
    return row.counted.trim() === '' || counted === null
      ? []
      : [{ currency: row.currency, method: row.method, counted }];
  });
}
