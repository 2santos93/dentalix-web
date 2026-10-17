/**
 * Mockea el `fetch` base (mismo enfoque que payments-api.test.ts) y comprueba
 * la ruta, la query y la cabecera de sede de la cartera (DX-145).
 */
import { downloadReceivablesCsv, getReceivablesAging } from './receivables-api';

describe('receivables-api', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    window.localStorage.clear();
  });

  function mockFetch(body: unknown = { items: [] }) {
    const spy = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => body,
      text: async () => String(body),
    });
    global.fetch = spy as unknown as typeof fetch;
    return spy;
  }

  it('GET /receivables/aging sin query cuando no hay filtros', async () => {
    const spy = mockFetch();
    await getReceivablesAging('tok');
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toMatch(/\/receivables\/aging$/);
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  it('manda los filtros presentes y la sede activa como cabecera', async () => {
    window.localStorage.setItem('dentalix.activeLocationId', 'loc-norte');
    const spy = mockFetch();
    await getReceivablesAging('tok', { minAgeDays: 91, minBalance: 0, currency: 'COP', page: 2 });
    const [url, init] = spy.mock.calls[0];
    expect(Object.fromEntries(new URL(String(url), 'http://x').searchParams)).toEqual({
      currency: 'COP',
      minBalance: '0',
      minAgeDays: '91',
      page: '2',
    });
    expect(init.headers['X-Location-Id']).toBe('loc-norte');
  });

  it('el CSV usa los mismos filtros, sin página, y devuelve el texto', async () => {
    const spy = mockFetch('\uFEFFPaciente');
    const text = await downloadReceivablesCsv('tok', { minAgeDays: 31 });
    const [url] = spy.mock.calls[0];
    const parsed = new URL(String(url), 'http://x');
    expect(parsed.pathname).toMatch(/\/receivables\/aging\.csv$/);
    expect(Object.fromEntries(parsed.searchParams)).toEqual({ minAgeDays: '31' });
    expect(text).toBe('\uFEFFPaciente');
  });
});
