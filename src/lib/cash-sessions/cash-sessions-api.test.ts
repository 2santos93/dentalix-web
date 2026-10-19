/**
 * Mockea el `fetch` base (mismo enfoque que payments-api.test.ts) y comprueba
 * rutas, métodos, cuerpos y la sede activa como cabecera.
 */
import {
  canManageCashSessions,
  canUseCashSessions,
  closeCashSession,
  getCurrentCashSession,
  listCashSessions,
  openCashSession,
  reopenCashSession,
  saveCashSettings,
} from './cash-sessions-api';

describe('cash-sessions-api (DX-027)', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    window.localStorage.clear();
  });

  function mockFetch(body: unknown = {}) {
    const spy = jest.fn().mockResolvedValue({ ok: true, json: async () => body });
    global.fetch = spy as unknown as typeof fetch;
    return spy;
  }

  const call = (spy: jest.Mock, i = 0) => {
    const [url, init] = spy.mock.calls[i] as [string, RequestInit & { headers: Record<string, string> }];
    return { url: new URL(String(url), 'http://x'), init };
  };

  it('roles: ADMIN y RECEPTION usan la caja; solo ADMIN reabre, corrige y ajusta', () => {
    expect(canUseCashSessions('RECEPTION')).toBe(true);
    expect(canUseCashSessions('DENTIST')).toBe(false);
    expect(canManageCashSessions('ADMIN')).toBe(true);
    expect(canManageCashSessions('RECEPTION')).toBe(false);
  });

  it('mi caja actual y abrir van con la sede activa como cabecera', async () => {
    window.localStorage.setItem('dentalix.activeLocationId', 'loc-2');
    const spy = mockFetch();
    await getCurrentCashSession('tok');
    await openCashSession('tok', { floats: [{ currency: 'COP', amount: 50_000 }] });
    expect(call(spy).url.pathname).toMatch(/\/cash-sessions\/current$/);
    expect(call(spy).init.headers['X-Location-Id']).toBe('loc-2');
    const open = call(spy, 1);
    expect(open.url.pathname).toMatch(/\/cash-sessions\/open$/);
    expect(open.init.method).toBe('POST');
    expect(JSON.parse(String(open.init.body))).toEqual({ floats: [{ currency: 'COP', amount: 50_000 }] });
  });

  it('la lista no manda filtros ausentes', async () => {
    const spy = mockFetch({ items: [], total: 0, page: 1, pageSize: 20 });
    await listCashSessions('tok');
    await listCashSessions('tok', { from: '2026-10-01', to: '2026-10-17', status: 'CLOSED', page: 2 });
    expect(call(spy).url.search).toBe('');
    expect(Object.fromEntries(call(spy, 1).url.searchParams)).toEqual({
      from: '2026-10-01',
      to: '2026-10-17',
      status: 'CLOSED',
      page: '2',
    });
  });

  it('cerrar, reabrir y guardar los ajustes', async () => {
    const spy = mockFetch();
    await closeCashSession('tok', 's 1', {
      counts: [{ currency: 'COP', method: 'CASH', counted: 1 }],
      differenceReason: 'Faltó cambio',
    });
    await reopenCashSession('tok', 's1', 'Faltó un abono');
    await saveCashSettings('tok', { requireOpenSession: true, blindClose: false });
    expect(call(spy).url.pathname).toMatch(/\/cash-sessions\/s%201\/close$/);
    expect(JSON.parse(String(call(spy, 1).init.body))).toEqual({ reason: 'Faltó un abono' });
    expect(call(spy, 2).init.method).toBe('PUT');
  });
});
