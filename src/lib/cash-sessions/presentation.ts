import { statusLabel } from '@/lib/status/tones';
import type { CashSessionSummary } from './cash-sessions-api';

/** DX-522: quien pinta pasa el formateador de importes de la sede (con el código ISO); sin sede, «—». */
type Money = (amount: number, currency: string) => string;

/** Estado de un turno para el chip: abierta, cerrada o reabierta (abierta otra vez). */
export function sessionStatusKey(
  session: Pick<CashSessionSummary, 'status' | 'reopenCount'>,
): 'OPEN' | 'REOPENED' | 'CLOSED' {
  if (session.status === 'CLOSED') return 'CLOSED';
  return session.reopenCount > 0 ? 'REOPENED' : 'OPEN';
}

export function sessionStatusLabel(session: Pick<CashSessionSummary, 'status' | 'reopenCount'>): string {
  return statusLabel('cashSession', sessionStatusKey(session));
}

/** «50,00 EUR · 10,00 USD», o «Sin fondo». */
export function moneyList(
  items: readonly { currency: string; amount: number }[],
  empty = 'Sin fondo',
  money: Money,
): string {
  if (items.length === 0) return empty;
  return items.map((i) => money(i.amount, i.currency)).join(' · ');
}

/** SEC-043: lo que no se enseña mientras rige el arqueo ciego. */
export const AMOUNT_HIDDEN_TEXT = 'Oculto durante el arqueo';

/**
 * Diferencia del último cierre: «Cuadra» si todas son 0. SEC-043: una moneda
 * con `amount` null (arqueo ciego) dice «Oculto durante el arqueo», con su
 * código si hay más de una.
 */
export function differenceText(
  items: readonly { currency: string; amount: number | null }[],
  money: Money,
): string {
  const hidden = items.filter((i) => i.amount === null);
  const nonZero = items.flatMap((i) =>
    i.amount !== null && i.amount !== 0 ? [money(i.amount, i.currency)] : [],
  );
  const hiddenText = hidden.map((i) =>
    items.length > 1 ? `${AMOUNT_HIDDEN_TEXT} (${i.currency})` : AMOUNT_HIDDEN_TEXT,
  );
  if (nonZero.length === 0 && hiddenText.length === 0) return 'Cuadra';
  return [...nonZero, ...hiddenText].join(' · ');
}

/** SEC-043: alguna diferencia (visible) distinta de 0. */
export function hasVisibleDifference(items: readonly { amount: number | null }[]): boolean {
  return items.some((i) => i.amount !== null && i.amount !== 0);
}
