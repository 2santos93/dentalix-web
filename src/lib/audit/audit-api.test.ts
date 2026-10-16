/**
 * Mockea el `fetch` base (mismo enfoque que payments-api.test.ts) y comprueba
 * la ruta y la query que arma `listAuditEvents`.
 */
import { canReadAuditLog, listAuditEvents } from './audit-api';

describe('listAuditEvents', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function mockFetch() {
    const body = { items: [], nextCursor: null, timeZone: 'America/Bogota' };
    const spy = jest.fn().mockResolvedValue({ ok: true, json: async () => body });
    global.fetch = spy as unknown as typeof fetch;
    return spy;
  }

  it('GET /audit-events sin query cuando no hay filtros', async () => {
    const spy = mockFetch();
    await listAuditEvents('tok', {});
    const [url, init] = spy.mock.calls[0];
    const parsed = new URL(String(url), 'http://x');
    expect(parsed.pathname).toMatch(/\/audit-events$/);
    expect(parsed.search).toBe('');
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  it('manda solo los filtros presentes, con el cursor y el límite', async () => {
    const spy = mockFetch();
    await listAuditEvents('tok', {
      patientId: 'p-1',
      actorUserId: undefined,
      action: 'VIEW',
      resourceType: 'MEDICAL_HISTORY',
      from: '2026-10-01T05:00:00.000Z',
      to: '2026-10-17T05:00:00.000Z',
      cursor: 'abc',
      limit: 25,
    });
    const parsed = new URL(String(spy.mock.calls[0][0]), 'http://x');
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      patientId: 'p-1',
      action: 'VIEW',
      resourceType: 'MEDICAL_HISTORY',
      from: '2026-10-01T05:00:00.000Z',
      to: '2026-10-17T05:00:00.000Z',
      cursor: 'abc',
      limit: '25',
    });
  });
});

describe('canReadAuditLog', () => {
  it('solo ADMIN (mismo @Roles que la API)', () => {
    expect(canReadAuditLog('ADMIN')).toBe(true);
    expect(canReadAuditLog('DENTIST')).toBe(false);
    expect(canReadAuditLog('ASSISTANT')).toBe(false);
    expect(canReadAuditLog('RECEPTION')).toBe(false);
    expect(canReadAuditLog(null)).toBe(false);
  });
});
