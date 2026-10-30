/**
 * DX-374: tasa de cambio de la clínica. Mismo enfoque que exchange-api.test.ts:
 * se simula `fetch` y se comprueban ruta, método y cuerpo.
 */
import {
  canManageExchangeRates,
  getExchangeRateSettings,
  listManualExchangeRates,
  parseRateInput,
  RATE_INPUT_COPY,
  registerManualExchangeRate,
  saveExchangeRateSettings,
} from './exchange-settings-api';

describe('exchange-settings-api', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function mockFetch(body: unknown) {
    const spy = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body });
    global.fetch = spy as unknown as typeof fetch;
    return spy;
  }

  it('solo ADMIN gestiona la tasa de cambio', () => {
    expect(canManageExchangeRates('ADMIN')).toBe(true);
    for (const role of ['DENTIST', 'ASSISTANT', 'RECEPTION', null] as const) {
      expect(canManageExchangeRates(role)).toBe(false);
    }
  });

  it('getExchangeRateSettings: GET /exchange/settings', async () => {
    const spy = mockFetch({ source: 'AUTOMATIC' });
    await expect(getExchangeRateSettings('tok')).resolves.toEqual({ source: 'AUTOMATIC' });
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toMatch(/\/exchange\/settings$/);
    expect(init.method ?? 'GET').toBe('GET');
  });

  it('saveExchangeRateSettings: PUT /exchange/settings con la fuente', async () => {
    const spy = mockFetch({ source: 'MANUAL' });
    await saveExchangeRateSettings('tok', 'MANUAL');
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toMatch(/\/exchange\/settings$/);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ source: 'MANUAL' });
  });

  it('listManualExchangeRates: GET /exchange/manual-rates con el límite', async () => {
    const spy = mockFetch([]);
    await listManualExchangeRates('tok', 30);
    expect(String(spy.mock.calls[0][0])).toMatch(/\/exchange\/manual-rates\?limit=30$/);
  });

  it('registerManualExchangeRate: POST /exchange/manual-rates', async () => {
    const spy = mockFetch({ id: 'r1' });
    await registerManualExchangeRate('tok', { date: '2026-10-30', currency: 'VES', rate: 36.5 });
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toMatch(/\/exchange\/manual-rates$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ date: '2026-10-30', currency: 'VES', rate: 36.5 });
  });

  describe('parseRateInput', () => {
    it.each([
      ['36.5', 36.5],
      ['36,5', 36.5],
      [' 4000 ', 4000],
      ['0,00000001', 0.00000001],
      ['9999999.99999999', 9999999.99999999],
    ])('«%s» → %s', (text, value) => {
      expect(parseRateInput(text)).toEqual({ ok: true, value });
    });

    it('vacío pide la tasa', () => {
      expect(parseRateInput('  ')).toEqual({ ok: false, error: RATE_INPUT_COPY.missing });
    });

    it.each(['0', '0,0', '-1', 'abc', '1.000,50', '1,2,3', '1.', '1,123456789', '10000000'])(
      '«%s» es una tasa no válida',
      (text) => {
        const out = parseRateInput(text);
        expect(out.ok).toBe(false);
      },
    );

    it('más de 8 decimales lo dice', () => {
      expect(parseRateInput('1,123456789')).toEqual({ ok: false, error: RATE_INPUT_COPY.tooManyDecimals });
    });
  });
});
