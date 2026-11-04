import { callerDigitCount, hasEnoughCallerDigits, lookupCaller } from './caller-lookup-api';

describe('caller-lookup-api (DX-224)', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('manda el número en el CUERPO de un POST, nunca en la URL', async () => {
    const matches = [{ id: 'p1', firstName: 'Ana', lastName: 'Pérez' }];
    const spy = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ matches }) });
    global.fetch = spy as unknown as typeof fetch;

    const out = await lookupCaller('tok', '  0412-123.45.67 ');

    expect(out).toEqual(matches);
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toMatch(/\/patients\/lookup-by-phone$/);
    expect(String(url)).not.toContain('123');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ phone: '0412-123.45.67' });
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  it('cuenta los dígitos como la API: 7 o más', () => {
    expect(callerDigitCount('0412-123.45.67')).toBe(11);
    expect(callerDigitCount('+58 (412) 123')).toBe(8);
    expect(hasEnoughCallerDigits('412 123')).toBe(false);
    expect(hasEnoughCallerDigits('412 1234')).toBe(true);
    expect(hasEnoughCallerDigits('')).toBe(false);
    expect(hasEnoughCallerDigits('llamar')).toBe(false);
  });
});
