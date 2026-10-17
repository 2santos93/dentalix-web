import type { BadgeProps } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/format/currency';
import type { CashSessionSummary } from './cash-sessions-api';

/** Estado de un turno para el chip: abierta, cerrada o reabierta (abierta otra vez). */
export function sessionStatusLabel(session: Pick<CashSessionSummary, 'status' | 'reopenCount'>): string {
  if (session.status === 'CLOSED') return 'Cerrada';
  return session.reopenCount > 0 ? 'Reabierta' : 'Abierta';
}

export function sessionStatusVariant(
  session: Pick<CashSessionSummary, 'status' | 'reopenCount'>,
): BadgeProps['variant'] {
  if (session.status === 'CLOSED') return 'muted';
  return session.reopenCount > 0 ? 'warning' : 'success';
}

/** «50.000,00 COP · 10,00 USD», o «Sin fondo». */
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
