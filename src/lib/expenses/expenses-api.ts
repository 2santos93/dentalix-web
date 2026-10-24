import { apiFetch, apiFetchText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';
import type { SingleFileUploadRequest } from '@/lib/files/upload-single-file';

type Schemas = components['schemas'];

// Gastos de la sede (DX-274). Las formas salen del Swagger de la API.
export type Expense = Schemas['ExpenseDto'];
export type ExpensePayment = Schemas['ExpensePaymentDto'];
export type ExpenseDetail = Schemas['ExpenseDetailDto'];
export type ExpensePage = Schemas['ExpensePageDto'];
export type ExpenseStatus = Expense['status'];
export type ExpenseAttachment = Schemas['ExpenseAttachmentDto'];
export type CreateExpenseInput = Schemas['CreateExpenseDto'];
export type UpdateExpenseInput = Schemas['UpdateExpenseDto'];
export type InitialExpensePaymentInput = Schemas['InitialExpensePaymentDto'];
export type AddExpensePaymentInput = Schemas['AddExpensePaymentDto'];
export type ExpenseReceiptUpload = Schemas['ExpenseReceiptUploadDto'];
export type ExpenseReceiptUrl = Schemas['ExpenseReceiptUrlDto'];
export type ExpenseReceiptDisposition = ExpenseReceiptUrl['disposition'];
export type ExpenseSummary = Schemas['ExpenseSummaryDto'];
export type ExpenseSummaryRow = Schemas['ExpenseSummaryRowDto'];
export type CreateCashOutflowInput = Schemas['CreateCashOutflowDto'];

/** La pantalla Gastos y el resumen: solo ADMIN (EXPENSE_ROLES en la API). */
export function canManageExpenses(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/** Filtro de estado de la lista: `OPEN` = pendiente + parcial. */
export type ExpenseStatusFilter = ExpenseStatus | 'OPEN';

/**
 * Filtros de la lista y del CSV, por fecha de factura. La sede activa viaja en
 * `X-Location-Id` (la pone `apiFetch`); `locationId` acota dentro de ella, para
 * «Todas las sedes».
 */
export interface ExpenseFilters {
  from?: string;
  to?: string;
  locationId?: string;
  category?: string;
  status?: ExpenseStatusFilter;
  /** true = solo vencidos. */
  overdue?: boolean;
  /** Proveedor o descripción. */
  query?: string;
}

export interface ExpenseQuery extends ExpenseFilters {
  page?: number;
  pageSize?: number;
}

function searchOf(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

const expensePath = (id: string, rest = '') => `/expenses/${encodeURIComponent(id)}${rest}`;

/** `GET /expenses` — más reciente primero, paginado. */
export function listExpenses(token: string, query: ExpenseQuery = {}): Promise<ExpensePage> {
  return apiFetch<ExpensePage>(`/expenses${searchOf(query)}`, { token });
}

/** `GET /expenses.csv` — mismos filtros, sin paginar (auditado). */
export function downloadExpensesCsv(token: string, filters: ExpenseFilters = {}): Promise<string> {
  return apiFetchText(`/expenses.csv${searchOf(filters)}`, { token });
}

/** `GET /expenses/:id` — con sus pagos (y la caja de cada salida). */
export function getExpense(token: string, id: string): Promise<ExpenseDetail> {
  return apiFetch<ExpenseDetail>(expensePath(id), { token });
}

/**
 * `POST /expenses`, con su pago y su soporte si vienen. `idempotencyKey`
 * (UUID, una por apertura del modal) evita el doble registro de un reintento.
 */
export function createExpense(
  token: string,
  input: CreateExpenseInput,
  idempotencyKey: string,
): Promise<ExpenseDetail> {
  return apiFetch<ExpenseDetail>('/expenses', {
    method: 'POST',
    body: input,
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}

/** `PATCH /expenses/:id` — sede, moneda e importe tienen reglas en la API. */
export function updateExpense(token: string, id: string, input: UpdateExpenseInput): Promise<ExpenseDetail> {
  return apiFetch<ExpenseDetail>(expensePath(id), { method: 'PATCH', body: input, token });
}

/** `POST /expenses/:id/void` — anula el gasto y todos sus pagos vivos. */
export function voidExpense(token: string, id: string, reason: string): Promise<ExpenseDetail> {
  return apiFetch<ExpenseDetail>(expensePath(id, '/void'), { method: 'POST', body: { reason }, token });
}

/** `POST /expenses/:id/payments` — pago total o parcial, idempotente. */
export function addExpensePayment(
  token: string,
  id: string,
  input: AddExpensePaymentInput,
  idempotencyKey: string,
): Promise<ExpenseDetail> {
  return apiFetch<ExpenseDetail>(expensePath(id, '/payments'), {
    method: 'POST',
    body: input,
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}

/** `POST /expenses/:id/payments/:paymentId/void`. */
export function voidExpensePayment(
  token: string,
  id: string,
  paymentId: string,
  reason: string,
): Promise<ExpenseDetail> {
  return apiFetch<ExpenseDetail>(expensePath(id, `/payments/${encodeURIComponent(paymentId)}/void`), {
    method: 'POST',
    body: { reason },
    token,
  });
}

/**
 * `POST /expenses/attachments/upload-url` — autorización para subir el soporte
 * directo al almacén (ADMIN y recepción). El `uploadId` va al alta, a la salida
 * de caja o a `attachExpenseReceipt`.
 */
export function requestExpenseReceiptUpload(
  token: string,
  request: SingleFileUploadRequest,
): Promise<ExpenseReceiptUpload> {
  return apiFetch<ExpenseReceiptUpload>('/expenses/attachments/upload-url', {
    method: 'POST',
    body: request,
    token,
  });
}

/** `POST /expenses/:id/attachment` — solo si el gasto aún no tiene soporte. */
export function attachExpenseReceipt(token: string, id: string, uploadId: string): Promise<ExpenseDetail> {
  return apiFetch<ExpenseDetail>(expensePath(id, '/attachment'), {
    method: 'POST',
    body: { uploadId },
    token,
  });
}

/** URL firmada de vida corta del soporte; cada una queda auditada. */
export function getExpenseReceiptUrl(
  token: string,
  id: string,
  disposition: ExpenseReceiptDisposition,
): Promise<ExpenseReceiptUrl> {
  return apiFetch<ExpenseReceiptUrl>(expensePath(id, `/attachment/url${searchOf({ disposition })}`), { token });
}

/** `GET /expenses/suppliers` — hasta 20 proveedores ya usados en la clínica. */
export function suggestExpenseSuppliers(token: string, query = ''): Promise<string[]> {
  return apiFetch<string[]>(`/expenses/suppliers${searchOf({ query: query.trim() })}`, { token });
}

export interface ExpenseSummaryQuery {
  from: string;
  to: string;
  locationId?: string;
}

/** `GET /expenses/summary` — ingresos − gastos por mes, sede y moneda. */
export function getExpenseSummary(token: string, query: ExpenseSummaryQuery): Promise<ExpenseSummary> {
  return apiFetch<ExpenseSummary>(`/expenses/summary${searchOf(query)}`, { token });
}

/** `GET /expenses/summary.csv` (auditado). */
export function downloadExpenseSummaryCsv(token: string, query: ExpenseSummaryQuery): Promise<string> {
  return apiFetchText(`/expenses/summary.csv${searchOf(query)}`, { token });
}

/**
 * `POST /cash-sessions/current/outflows` — salida de caja menor desde MI caja
 * abierta (ADMIN y recepción). `locationId` es la sede de esa caja: va en
 * `X-Location-Id` para que la API no tenga que adivinarla entre varias cajas.
 */
export function createCashOutflow(
  token: string,
  input: CreateCashOutflowInput,
  idempotencyKey: string,
  locationId: string,
): Promise<ExpenseDetail> {
  return apiFetch<ExpenseDetail>('/cash-sessions/current/outflows', {
    method: 'POST',
    body: input,
    token,
    headers: { 'Idempotency-Key': idempotencyKey, 'X-Location-Id': locationId },
  });
}
