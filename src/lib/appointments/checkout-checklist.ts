import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

/**
 * DX-537: la API publica `balance` como objeto sin forma (`type: Object` en el
 * DTO, y el esquema lo da como `Record<string, never>`). Su descripción y la
 * lista de la agenda dicen que es el saldo vencido de siempre
 * (`OverdueBalanceDto`): se tipa así aquí hasta que la API lo publique bien.
 */
export type CheckoutChecklist = Omit<components['schemas']['CheckoutChecklistDto'], 'balance'> & {
  balance: components['schemas']['OverdueBalanceDto'] | null;
};
export type CheckoutItem = 'NEXT_VISIT' | 'PAYMENT' | 'PHONE' | 'EMAIL';

/** `GET /appointments/:id/checkout-checklist` (DX-202). */
export function getCheckoutChecklist(token: string, appointmentId: string): Promise<CheckoutChecklist> {
  return apiFetch<CheckoutChecklist>(`/appointments/${encodeURIComponent(appointmentId)}/checkout-checklist`, { token });
}

/** ¿Está cumplido cada punto? El cobro no sale para quien no cobra (`balance: null`). */
export function checkoutItems(list: CheckoutChecklist): { item: CheckoutItem; done: boolean }[] {
  const items: { item: CheckoutItem; done: boolean }[] = [
    { item: 'NEXT_VISIT', done: list.nextAppointmentStart !== null || list.recallDueOn !== null },
  ];
  if (list.balance) items.push({ item: 'PAYMENT', done: list.balance.hasOverdue !== true });
  items.push({ item: 'PHONE', done: list.hasPhone }, { item: 'EMAIL', done: list.hasEmail });
  return items;
}
