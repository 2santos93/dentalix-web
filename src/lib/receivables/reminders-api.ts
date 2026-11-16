import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { CollectionNote } from '@/lib/collections/collections-api';

// «Por avisar hoy» de la cartera (DX-146). La forma sale del Swagger de la API.
export type BalanceRemindersPage = components['schemas']['BalanceRemindersPageDto'];
export type BalanceReminderRow = components['schemas']['BalanceReminderRowDto'];
export type BalanceReminderPolicy = components['schemas']['BalanceReminderPolicyDto'];
export type MarkBalanceReminderInput = components['schemas']['MarkBalanceReminderDto'];

/** Filas por página: la lista del día casi nunca pasa de aquí. */
export const BALANCE_REMINDERS_PAGE_SIZE = 50;

/**
 * `GET /receivables/reminders` — a quién toca avisar hoy de su saldo vencido.
 * La sede viaja en `X-Location-Id` (el cliente la manda en cada petición).
 */
export function getBalanceReminders(
  token: string,
  query: { page?: number; pageSize?: number } = {},
): Promise<BalanceRemindersPage> {
  const search = new URLSearchParams();
  search.set('page', String(query.page ?? 1));
  search.set('pageSize', String(query.pageSize ?? BALANCE_REMINDERS_PAGE_SIZE));
  return apiFetch<BalanceRemindersPage>(`/receivables/reminders?${search.toString()}`, { token });
}

/** `POST /patients/:id/balance-reminders` — «Marcar avisado» (una gestión REMINDER_SENT; 409 si ya hoy). */
export function markBalanceReminder(
  token: string,
  patientId: string,
  input: MarkBalanceReminderInput = { channel: 'WHATSAPP_LINK' },
): Promise<CollectionNote> {
  return apiFetch<CollectionNote>(`/patients/${patientId}/balance-reminders`, {
    method: 'POST',
    body: input,
    token,
  });
}

/** `PUT /receivables/reminder-policy` — solo ADMIN (auditado). */
export function updateReminderPolicy(token: string, policy: BalanceReminderPolicy): Promise<BalanceReminderPolicy> {
  return apiFetch<BalanceReminderPolicy>('/receivables/reminder-policy', {
    method: 'PUT',
    body: policy,
    token,
  });
}
