import { regionalFormat } from '@/lib/format/regional-format';
/**
 * Mockea el `fetch` base y comprueba rutas, métodos y cuerpos de cada llamada,
 * más los permisos por rol y las utilidades de presentación (DX-191).
 */
import {
  canReadImplants,
  canRegisterImplants,
  canSearchImplantLots,
  canVoidImplant,
  downloadImplantLotCsv,
  formatImplantSize,
  getImplantCard,
  getImplantCatalog,
  groupImplantsByTooth,
  implantCardPrintHref,
  implantLotCsvFileName,
  listPatientImplants,
  printImplantCard,
  registerImplant,
  searchImplantLots,
  voidImplant,
  type PatientImplant,
} from './implants-api';

describe('implants-api', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function mockFetch(body: unknown = []) {
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
    };
  }

  it('permisos: todos ven; registran DENTIST y ADMIN; buscan por lote solo ADMIN', () => {
    expect(canReadImplants('RECEPTION')).toBe(true);
    expect(canReadImplants(null)).toBe(false);
    expect(canRegisterImplants('RECEPTION')).toBe(false);
    expect(canRegisterImplants('ASSISTANT')).toBe(false);
    expect(canRegisterImplants('DENTIST')).toBe(true);
    expect(canSearchImplantLots('DENTIST')).toBe(false);
    expect(canSearchImplantLots('ADMIN')).toBe(true);
  });

  it('anular: el autor o un ADMIN, y solo un implante vivo', () => {
    const implant = { voidedAt: null, professionalId: 'u1' };
    expect(canVoidImplant(implant, { role: 'DENTIST', userId: 'u1' })).toBe(true);
    expect(canVoidImplant(implant, { role: 'DENTIST', userId: 'u2' })).toBe(false);
    expect(canVoidImplant(implant, { role: 'ADMIN', userId: 'u2' })).toBe(true);
    expect(canVoidImplant(implant, { role: 'RECEPTION', userId: 'u1' })).toBe(false);
    expect(
      canVoidImplant({ ...implant, voidedAt: '2026-10-17T10:00:00Z' }, { role: 'ADMIN', userId: 'u1' }),
    ).toBe(false);
  });

  it('rutas y cuerpos', async () => {
    const spy = mockFetch({});
    await listPatientImplants('tok', 'p1');
    const input = {
      toothNumber: '36',
      kind: 'IMPLANT' as const,
      manufacturer: 'Straumann',
      reference: '021.5310',
      lot: 'LOT-1',
    };
    await registerImplant('tok', 'p1', input);
    await voidImplant('tok', 'i/1', 'Error de lote');
    await getImplantCard('tok', 'p1', '2026-10-17');
    await printImplantCard('tok', 'p1', '2026-10-17');
    await getImplantCatalog('tok');
    await searchImplantLots('tok', { lot: ' LOT-1 ', reference: '' });
    expect(call(spy, 0)).toMatchObject({ path: '/api/v1/patients/p1/implants', method: 'GET' });
    expect(call(spy, 1)).toMatchObject({
      method: 'POST',
      body: input,
    });
    expect(call(spy, 2)).toMatchObject({
      path: '/api/v1/implants/i%2F1/void',
      body: { reason: 'Error de lote' },
    });
    expect(call(spy, 3)).toMatchObject({
      path: '/api/v1/patients/p1/implant-card',
      search: '?date=2026-10-17',
    });
    expect(call(spy, 4)).toMatchObject({
      path: '/api/v1/patients/p1/implant-card/print',
      method: 'POST',
      body: { date: '2026-10-17' },
    });
    expect(call(spy, 5).path).toBe('/api/v1/implants/catalog');
    expect(call(spy, 6)).toMatchObject({ path: '/api/v1/implants/search', search: '?lot=LOT-1' });
  });

  it('el CSV devuelve el texto', async () => {
    mockFetch('"Paciente"\r\n');
    await expect(downloadImplantLotCsv('tok', { reference: '021.5310' })).resolves.toContain(
      'Paciente',
    );
  });

  it('formatImplantSize en-US is 4.1 × 10 mm', () => {
    expect(formatImplantSize(4.1, 10, regionalFormat({ locale: 'en-US', hourCycle: 'h12' }))).toBe('4.1 × 10 mm');
  });

  it('presentación: medidas, agrupación por diente, enlaces y nombre del CSV', () => {
    const enUS = regionalFormat({ locale: 'en-US', hourCycle: 'h12' });
    const deDE = regionalFormat({ locale: 'de-DE', hourCycle: 'h23' });
    expect(formatImplantSize(4.1, 10, enUS)).toBe('4.1 × 10 mm');
    expect(formatImplantSize(4.1, null, deDE)).toBe('Ø 4,1 mm');
    expect(formatImplantSize(null, null, enUS)).toBeNull();
    // Sin formato de la sede: «—», nunca otro formato.
    expect(formatImplantSize(4.1, 10, null)).toBe('—');
    expect(formatImplantSize(null, null, null)).toBeNull();
    const implants = [
      { id: 'a', toothNumber: '46' },
      { id: 'b', toothNumber: '36' },
      { id: 'c', toothNumber: '36' },
    ] as PatientImplant[];
    expect(groupImplantsByTooth(implants).map((g) => [g.toothNumber, g.implants.map((i) => i.id)])).toEqual([
      ['36', ['b', 'c']],
      ['46', ['a']],
    ]);
    expect(implantCardPrintHref('p1', '2026-10-17')).toBe(
      '/print/patients/p1/implant-card?date=2026-10-17',
    );
    expect(implantLotCsvFileName({ lot: 'LOT 1/2' })).toBe('implantes-LOT-1-2.csv');
  });
});
