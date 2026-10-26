/** Rutas, métodos, cuerpos y cabeceras de los clientes de gastos (DX-274). */
import {
  addExpensePayment,
  attachExpenseReceipt,
  canManageExpenses,
  createCashOutflow,
  createExpense,
  downloadExpenseSummaryCsv,
  downloadExpensesCsv,
  getExpense,
  getExpenseReceiptUrl,
  getExpenseSummary,
  listExpenses,
  requestExpenseReceiptUpload,
  suggestExpenseSuppliers,
  updateExpense,
  voidExpense,
  voidExpensePayment,
} from './expenses-api';
import { createExpenseCategory, listExpenseCategories, retireExpenseCategory } from './expense-categories-api';

describe('expenses-api', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function mockFetch(body: unknown = {}) {
    const spy = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    });
    global.fetch = spy as unknown as typeof fetch;
    return spy;
  }

  function call(spy: jest.Mock, index = 0) {
    const [url, init] = spy.mock.calls[index];
    const parsed = new URL(String(url), 'http://x');
    return {
      path: parsed.pathname,
      search: parsed.search,
      method: (init.method ?? 'GET') as string,
      body: init.body ? JSON.parse(init.body as string) : undefined,
      headers: init.headers as Record<string, string>,
    };
  }

  it('solo ADMIN gestiona gastos', () => {
    expect(canManageExpenses('ADMIN')).toBe(true);
    expect(canManageExpenses('RECEPTION')).toBe(false);
    expect(canManageExpenses(null)).toBe(false);
  });

  it('lista y exporta con los filtros en la query, sin los vacíos', async () => {
    const spy = mockFetch({ items: [], total: 0, page: 1, pageSize: 20 });
    await listExpenses('tok', { from: '2026-10-01', to: '2026-10-24', status: 'OPEN', overdue: true, query: '', page: 2 });
    await downloadExpensesCsv('tok', { from: '2026-10-01', to: '2026-10-24', category: 'Arriendo', locationId: 'loc-2' });
    expect(call(spy, 0).path).toMatch(/\/expenses$/);
    expect(call(spy, 0).search).toBe('?from=2026-10-01&to=2026-10-24&status=OPEN&overdue=true&page=2');
    expect(call(spy, 1).path).toMatch(/\/expenses\.csv$/);
    expect(call(spy, 1).search).toBe('?from=2026-10-01&to=2026-10-24&category=Arriendo&locationId=loc-2');
  });

  it('alta y pago con Idempotency-Key; edición y anulaciones con su cuerpo', async () => {
    const spy = mockFetch({});
    await getExpense('tok', 'exp 1');
    await createExpense('tok', { category: 'Arriendo', amount: 10, currency: 'COP', invoiceDate: '2026-10-01' }, 'key-1');
    await updateExpense('tok', 'exp-1', { supplier: null });
    await voidExpense('tok', 'exp-1', 'Factura duplicada');
    await addExpensePayment('tok', 'exp-1', { amount: 5, method: 'CASH', fromCashSession: true }, 'key-2');
    await voidExpensePayment('tok', 'exp-1', 'pay-1', 'Pago equivocado');

    expect(call(spy, 0).path).toMatch(/\/expenses\/exp%201$/);
    expect(call(spy, 1)).toMatchObject({ method: 'POST', body: { category: 'Arriendo', amount: 10 } });
    expect(call(spy, 1).headers['Idempotency-Key']).toBe('key-1');
    expect(call(spy, 2)).toMatchObject({ method: 'PATCH', body: { supplier: null } });
    expect(call(spy, 3)).toMatchObject({ method: 'POST', body: { reason: 'Factura duplicada' } });
    expect(call(spy, 3).path).toMatch(/\/expenses\/exp-1\/void$/);
    expect(call(spy, 4).path).toMatch(/\/expenses\/exp-1\/payments$/);
    expect(call(spy, 4).headers['Idempotency-Key']).toBe('key-2');
    expect(call(spy, 4).body).toEqual({ amount: 5, method: 'CASH', fromCashSession: true });
    expect(call(spy, 5).path).toMatch(/\/expenses\/exp-1\/payments\/pay-1\/void$/);
    expect(call(spy, 5).body).toEqual({ reason: 'Pago equivocado' });
  });

  it('soporte: autorización, adjuntar y URL firmada por disposición', async () => {
    const spy = mockFetch({});
    await requestExpenseReceiptUpload('tok', { name: 'luz.pdf', mimeType: 'application/pdf', size: 10, sha256: 'ab' });
    await attachExpenseReceipt('tok', 'exp-1', 'up-1');
    await getExpenseReceiptUrl('tok', 'exp-1', 'attachment');
    expect(call(spy, 0)).toMatchObject({ method: 'POST', body: { name: 'luz.pdf', size: 10, sha256: 'ab' } });
    expect(call(spy, 0).path).toMatch(/\/expenses\/attachments\/upload-url$/);
    expect(call(spy, 1)).toMatchObject({ method: 'POST', body: { uploadId: 'up-1' } });
    expect(call(spy, 1).path).toMatch(/\/expenses\/exp-1\/attachment$/);
    expect(call(spy, 2).path).toMatch(/\/expenses\/exp-1\/attachment\/url$/);
    expect(call(spy, 2).search).toBe('?disposition=attachment');
  });

  it('sugerencias de proveedor, resumen y su CSV', async () => {
    const spy = mockFetch([]);
    await suggestExpenseSuppliers('tok', '  lab ');
    await suggestExpenseSuppliers('tok');
    await getExpenseSummary('tok', { from: '2026-01-01', to: '2026-10-31' });
    await downloadExpenseSummaryCsv('tok', { from: '2026-01-01', to: '2026-10-31', locationId: 'loc-1' });
    expect(call(spy, 0).search).toBe('?query=lab');
    expect(call(spy, 1).search).toBe('');
    expect(call(spy, 2).path).toMatch(/\/expenses\/summary$/);
    expect(call(spy, 3).path).toMatch(/\/expenses\/summary\.csv$/);
    expect(call(spy, 3).search).toBe('?from=2026-01-01&to=2026-10-31&locationId=loc-1');
  });

  it('la salida de caja manda la sede de la caja en X-Location-Id', async () => {
    const spy = mockFetch({});
    await createCashOutflow('tok', { category: 'Mensajería', amount: 8000, currency: 'COP' }, 'key-3', 'loc-2');
    expect(call(spy, 0)).toMatchObject({ method: 'POST', body: { category: 'Mensajería', amount: 8000 } });
    expect(call(spy, 0).path).toMatch(/\/cash-sessions\/current\/outflows$/);
    expect(call(spy, 0).headers).toMatchObject({ 'Idempotency-Key': 'key-3', 'X-Location-Id': 'loc-2' });
  });

  it('categorías: lista, alta y retiro (204 sin cuerpo)', async () => {
    const spy = mockFetch([]);
    await listExpenseCategories('tok');
    await createExpenseCategory('tok', 'Seguros');
    spy.mockResolvedValueOnce({ ok: true, status: 204, json: async () => null, text: async () => '' });
    await expect(retireExpenseCategory('tok', 'cat 1')).resolves.toBeUndefined();
    expect(call(spy, 0).path).toMatch(/\/expense-categories$/);
    expect(call(spy, 1)).toMatchObject({ method: 'POST', body: { name: 'Seguros' } });
    expect(call(spy, 2)).toMatchObject({ method: 'DELETE' });
    expect(call(spy, 2).path).toMatch(/\/expense-categories\/cat%201$/);
  });
});
