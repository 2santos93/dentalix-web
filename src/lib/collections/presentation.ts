import type { ClinicRole } from '@/lib/me/me-api';
import { formatCurrency } from '@/lib/format/currency';
import type {
  CollectionChannel,
  CollectionOutcome,
  OverdueBalance,
  PaymentPromiseStatus,
} from './collections-api';

/** Tope del texto de una gestión (igual que la API). */
export const NOTE_TEXT_MAX = 280;

export const CHANNEL_LABELS: Record<CollectionChannel, string> = {
  CALL: 'Llamada',
  WHATSAPP_LINK: 'WhatsApp',
  EMAIL: 'Email',
  IN_PERSON: 'En persona',
};

export const OUTCOME_LABELS: Record<CollectionOutcome, string> = {
  NO_ANSWER: 'No contesta',
  PROMISED_PAYMENT: 'Promete pago',
  WILL_PAY_AT_APPOINTMENT: 'Pagará en la cita',
  DISPUTE: 'Disputa el saldo',
  WRONG_NUMBER: 'Número erróneo',
};

export const PROMISE_STATUS_LABELS: Record<PaymentPromiseStatus, string> = {
  OPEN: 'Abierto',
  KEPT: 'Cumplido',
  BROKEN: 'Incumplido',
};

export const PROMISE_STATUS_BADGE: Record<PaymentPromiseStatus, 'muted' | 'success' | 'danger'> = {
  OPEN: 'muted',
  KEPT: 'success',
  BROKEN: 'danger',
};

export const CHANNEL_ORDER: readonly CollectionChannel[] = ['CALL', 'WHATSAPP_LINK', 'EMAIL', 'IN_PERSON'];
export const OUTCOME_ORDER: readonly CollectionOutcome[] = [
  'NO_ANSWER',
  'PROMISED_PAYMENT',
  'WILL_PAY_AT_APPOINTMENT',
  'DISPUTE',
  'WRONG_NUMBER',
];

/** Quién gestiona la cobranza (registrar, ver notas y compromisos): como la cartera. */
export function canManageCollections(role: ClinicRole | null): boolean {
  return role === 'ADMIN' || role === 'RECEPTION';
}

const days = (n: number) => (n === 1 ? '1 día' : `${n} días`);

/**
 * Texto del chip «Saldo vencido». Con importe (ADMIN/RECEPTION) lo añade; sin
 * él (DENTIST/ASSISTANT), solo la marca y los días. `null` si no hay saldo vencido.
 */
export function overdueChipText(balance: OverdueBalance | null | undefined): string | null {
  if (!balance?.hasOverdue) return null;
  const base =
    balance.overdueDays !== null && balance.overdueDays !== undefined
      ? `Saldo vencido · ${days(balance.overdueDays)}`
      : 'Saldo vencido';
  const amounts = (balance.amounts ?? []).map((a) => formatCurrency(a.amount, a.currency));
  return amounts.length > 0 ? `${base} · ${amounts.join(' + ')}` : base;
}

/** Hoy (YYYY-MM-DD) en la hora local del navegador: mínimo del selector de fecha. */
export function todayLocal(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
