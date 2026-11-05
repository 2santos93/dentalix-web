import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

export type CheckoutChecklist = components['schemas']['CheckoutChecklistDto'];
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
