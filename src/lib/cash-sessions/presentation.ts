import { statusLabel } from '@/lib/status/tones';
import { formatCurrency } from '@/lib/format/currency';
import type { CashSessionSummary } from './cash-sessions-api';

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
export function moneyList(items: readonly { currency: string; amount: number }[], empty = 'Sin fondo'): string {
  if (items.length === 0) return empty;
  return items.map((i) => formatCurrency(i.amount, i.currency)).join(' · ');
}

/** Diferencia del último cierre: «Cuadra» si todas son 0. */
export function differenceText(items: readonly { currency: string; amount: number }[]): string {
  const nonZero = items.filter((i) => i.amount !== 0);
  if (nonZero.length === 0) return 'Cuadra';
  return nonZero.map((i) => formatCurrency(i.amount, i.currency)).join(' · ');
}
