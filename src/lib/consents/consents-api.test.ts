/**
 * Mockea el `fetch` base (mismo enfoque que account-statement-api.test.ts) y
 * comprueba rutas, métodos y cuerpos que arma cada llamada.
 */
import {
  canManageConsentTemplates,
  canUseConsents,
  consentPrintHref,
  createConsentTemplate,
  getPatientConsent,
  listConsentTemplates,
  listPatientConsents,
  previewPatientConsent,
  signPatientConsent,
  updateConsentTemplate,
} from './consents-api';

describe('consents-api', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function mockFetch(body: unknown = []) {
    const spy = jest.fn().mockResolvedValue({ ok: true, json: async () => body });
    global.fetch = spy as unknown as typeof fetch;
    return spy;
  }

  function call(spy: jest.Mock, index = 0) {
    const [url, init] = spy.mock.calls[index];
    const parsed = new URL(String(url), 'http://x');
    return {
      path: parsed.pathname,
      query: Object.fromEntries(parsed.searchParams),
      method: (init.method ?? 'GET') as string,
      body: init.body ? JSON.parse(init.body as string) : undefined,
      auth: init.headers.Authorization as string,
    };
  }

  it('lista plantillas, con el filtro de activas solo si se pide', async () => {
    const spy = mockFetch();
    await listConsentTemplates('tok');
    await listConsentTemplates('tok', { active: true });
    expect(call(spy, 0)).toMatchObject({ method: 'GET', query: {}, auth: 'Bearer tok' });
    expect(call(spy, 0).path).toMatch(/\/consent-templates$/);
    expect(call(spy, 1).query).toEqual({ active: 'true' });
  });

  it('crea y edita plantillas', async () => {
    const spy = mockFetch({});
    await createConsentTemplate('tok', { title: 'T', body: 'B' });
    await updateConsentTemplate('tok', 'tpl/1', { active: false });
    expect(call(spy, 0)).toMatchObject({ method: 'POST', body: { title: 'T', body: 'B' } });
    expect(call(spy, 1)).toMatchObject({ method: 'PATCH', body: { active: false } });
    expect(call(spy, 1).path).toMatch(/\/consent-templates\/tpl%2F1$/);
  });

  it('consentimientos del paciente: lista, vista previa, firma y detalle', async () => {
    const spy = mockFetch({});
    await listPatientConsents('tok', 'p1');
    await previewPatientConsent('tok', 'p1', { templateId: 't1' });
    await previewPatientConsent('tok', 'p1', { templateId: 't1', treatmentPlanId: 'plan-1' });
    await signPatientConsent('tok', 'p1', {
      templateId: 't1',
      templateVersion: 2,
      signerType: 'PATIENT',
      patientSignature: 'data:image/png;base64,AAA',
      professionalSignature: 'data:image/png;base64,BBB',
    });
    await getPatientConsent('tok', 'p1', 'c1');

    expect(call(spy, 0).path).toMatch(/\/patients\/p1\/consents$/);
    expect(call(spy, 1).path).toMatch(/\/patients\/p1\/consents\/preview$/);
    expect(call(spy, 1).query).toEqual({ templateId: 't1' });
    expect(call(spy, 2).query).toEqual({ templateId: 't1', treatmentPlanId: 'plan-1' });
    expect(call(spy, 3)).toMatchObject({
      method: 'POST',
      body: { templateId: 't1', templateVersion: 2, signerType: 'PATIENT' },
    });
    expect(call(spy, 4).path).toMatch(/\/patients\/p1\/consents\/c1$/);
  });

  it('roles: clínicos usan consentimientos, solo ADMIN gestiona plantillas', () => {
    expect(['DENTIST', 'ASSISTANT', 'ADMIN'].every((r) => canUseConsents(r as never))).toBe(true);
    expect(canUseConsents('RECEPTION')).toBe(false);
    expect(canUseConsents(null)).toBe(false);
    expect(canManageConsentTemplates('ADMIN')).toBe(true);
    expect(canManageConsentTemplates('DENTIST')).toBe(false);
    expect(canManageConsentTemplates(null)).toBe(false);
  });

  it('ruta de la vista imprimible', () => {
    expect(consentPrintHref('p 1', 'c1')).toBe('/print/patients/p%201/consents/c1');
  });
});
