import { statusLabels } from '@/lib/status/tones';
import type { ClinicRole } from '@/lib/me/me-api';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { sedeMoney } from '@/lib/format/sede-number';
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

/** Etiquetas; tono y etiqueta en `@/lib/status/tones` (`StatusBadge kind="paymentPromise"`). */
export const PROMISE_STATUS_LABELS: Record<PaymentPromiseStatus, string> = statusLabels('paymentPromise');

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
 * DX-354: el importe con el formato de la sede de la pantalla y el código ISO
 * (`fmt`); sin formato (cargando o sede sin él) el chip no lleva importe: ni parpadea
 * «—» mientras cargan las sedes ni inventa otro formato.
 */
export function overdueChipText(
  balance: OverdueBalance | null | undefined,
  fmt: RegionalFormat | null,
): string | null {
  if (!balance?.hasOverdue) return null;
  const base =
    balance.overdueDays !== null && balance.overdueDays !== undefined
      ? `Saldo vencido · ${days(balance.overdueDays)}`
      : 'Saldo vencido';
  const amounts = (fmt ? (balance.amounts ?? []) : []).map((a) => sedeMoney(a.amount, a.currency, fmt));
  const text = amounts.length > 0 ? `${base} · ${amounts.join(' + ')}` : base;
  // DX-472-bis: algún abono en otra moneda no cuenta todavía.
  return balance.incomplete ? `${text} · ${INCOMPLETE_BALANCE_TEXT}` : text;
}

/** DX-472-bis: el saldo no cuenta algún abono en otra moneda (sin tasa todavía). */
export const INCOMPLETE_BALANCE_TEXT = 'cifras incompletas';

/**
 * Sin saldo vencido pero con cifras incompletas (DX-472-bis): solo en la
 * ficha, para que nadie lea «al día» lo que aún no se pudo contar. `null` si
 * no aplica.
 */
export function incompleteBalanceChipText(balance: OverdueBalance | null | undefined): string | null {
  if (!balance?.incomplete || balance.hasOverdue) return null;
  return 'Saldo con cifras incompletas';
}
