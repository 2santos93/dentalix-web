/**
 * Mockea el `fetch` base (mismo enfoque que payments-api.test.ts) y comprueba
 * la ruta y la query que arma `getAccountStatement`.
 */
import { accountStatementPrintHref, getAccountStatement } from './account-statement-api';

describe('getAccountStatement', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function mockFetch() {
    const spy = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ summary: [] }) });
    global.fetch = spy as unknown as typeof fetch;
    return spy;
  }

  it('GET /patients/:id/account-statement sin query cuando no hay rango', async () => {
    const spy = mockFetch();
    await getAccountStatement('tok', 'pat-1');
    const [url, init] = spy.mock.calls[0];
    const parsed = new URL(String(url), 'http://x');
    expect(parsed.pathname).toMatch(/\/patients\/pat-1\/account-statement$/);
    expect(parsed.search).toBe('');
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  it('manda solo los extremos del rango que vienen', async () => {
    const spy = mockFetch();
    await getAccountStatement('tok', 'pat-1', { from: '2026-01-01' });
    const parsed = new URL(String(spy.mock.calls[0][0]), 'http://x');
    expect(Object.fromEntries(parsed.searchParams)).toEqual({ from: '2026-01-01' });
  });

  it('codifica el id del paciente en la ruta', async () => {
    const spy = mockFetch();
    await getAccountStatement('tok', 'a/b');
    expect(String(spy.mock.calls[0][0])).toContain('/patients/a%2Fb/account-statement');
  });
});

describe('accountStatementPrintHref', () => {
  it('apunta a la vista imprimible, fuera del shell de la app', () => {
    expect(accountStatementPrintHref('pat-1')).toBe('/print/patients/pat-1/account-statement');
  });
});
