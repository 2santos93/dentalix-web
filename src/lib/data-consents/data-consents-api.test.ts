/**
 * Mockea el `fetch` base (mismo enfoque que account-statement-api.test.ts) y
 * comprueba rutas, métodos y cuerpos.
 */
import {
  canPublishPrivacyPolicy,
  decisionsFromSelection,
  getPatientDataConsents,
  getPrivacyPolicies,
  publishPrivacyPolicy,
  recordDataConsents,
} from './data-consents-api';

describe('data-consents-api', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function mockFetch() {
    const spy = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = spy as unknown as typeof fetch;
    return spy;
  }

  function call(spy: jest.Mock, i = 0) {
    const [url, init] = spy.mock.calls[i];
    return {
      path: new URL(String(url), 'http://x').pathname,
      method: init.method ?? 'GET',
      body: init.body ? JSON.parse(init.body as string) : undefined,
      auth: init.headers.Authorization,
    };
  }

  it('GET /privacy-policies', async () => {
    const spy = mockFetch();
    await getPrivacyPolicies('tok');
    expect(call(spy)).toMatchObject({ method: 'GET', auth: 'Bearer tok' });
    expect(call(spy).path).toMatch(/\/privacy-policies$/);
  });

  it('POST /privacy-policies con los cuatro textos', async () => {
    const spy = mockFetch();
    const content = {
      policyText: 'p',
      generalText: 'g',
      sensitiveHealthText: 's',
      marketingText: 'm',
    };
    await publishPrivacyPolicy('tok', content);
    expect(call(spy)).toMatchObject({ method: 'POST', body: content });
  });

  it('GET y POST /patients/:id/data-consents (id codificado)', async () => {
    const spy = mockFetch();
    await getPatientDataConsents('tok', 'pa/1');
    await recordDataConsents('tok', 'pa/1', {
      policyVersionId: 'pol-1',
      decisions: [{ scope: 'MARKETING', granted: false }],
    });
    expect(call(spy, 0).path).toMatch(/\/patients\/pa%2F1\/data-consents$/);
    expect(call(spy, 1)).toMatchObject({
      method: 'POST',
      body: { policyVersionId: 'pol-1', decisions: [{ scope: 'MARKETING', granted: false }] },
    });
  });
});

describe('decisionsFromSelection', () => {
  it('solo las casillas marcadas se convierten en decisión: el silencio no autoriza', () => {
    expect(
      decisionsFromSelection({ GENERAL: true, SENSITIVE_HEALTH: false, MARKETING: true }),
    ).toEqual([
      { scope: 'GENERAL', granted: true },
      { scope: 'MARKETING', granted: true },
    ]);
    expect(
      decisionsFromSelection({ GENERAL: false, SENSITIVE_HEALTH: false, MARKETING: false }),
    ).toEqual([]);
  });
});

describe('canPublishPrivacyPolicy', () => {
  it('solo ADMIN', () => {
    expect(canPublishPrivacyPolicy('ADMIN')).toBe(true);
    expect(canPublishPrivacyPolicy('RECEPTION')).toBe(false);
    expect(canPublishPrivacyPolicy(null)).toBe(false);
  });
});
