import { apiFetch, apiFetchOrNull } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

/**
 * Categoría de gasto (DX-274): las predefinidas son constantes de la API (sin
 * `id`) y las propias son filas de la clínica.
 */
export type ExpenseCategory = components['schemas']['ExpenseCategoryDto'];

/** `GET /expense-categories` — predefinidas + propias activas, para elegir. */
export function listExpenseCategories(token: string): Promise<ExpenseCategory[]> {
  return apiFetch<ExpenseCategory[]>('/expense-categories', { token });
}

/** `POST /expense-categories` — una propia (solo ADMIN). */
export function createExpenseCategory(token: string, name: string): Promise<ExpenseCategory> {
  return apiFetch<ExpenseCategory>('/expense-categories', { method: 'POST', body: { name }, token });
}

/**
 * `DELETE /expense-categories/:id` — la retira (204 sin cuerpo). Los gastos
 * que ya la usan conservan el nombre.
 */
export async function retireExpenseCategory(token: string, id: string): Promise<void> {
  await apiFetchOrNull<null>(`/expense-categories/${encodeURIComponent(id)}`, { method: 'DELETE', token });
}
