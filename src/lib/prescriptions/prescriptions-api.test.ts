/**
 * Mockea el `fetch` base (mismo enfoque que consents-api.test.ts) y comprueba
 * rutas, métodos y cuerpos que arma cada llamada, más los permisos por rol.
 */
import {
  canIssuePrescriptions,
  canManagePrescriptionSettings,
  canManagePrescriptionTemplates,
  canUsePrescriptions,
  canVoidPrescription,
  checkPrescriptionSafety,
  createPrescriptionTemplate,
  deletePrescriptionTemplate,
  getPrescription,
  getPrescriptionIssuer,
  getPrescriptionSettings,
  issuePrescription,
  listPatientPrescriptions,
  listPrescriptionTemplates,
  prescriptionPrintHref,
  savePrescriptionSettings,
  updatePrescriptionTemplate,
  voidPrescription,
} from './prescriptions-api';

describe('prescriptions-api', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function mockFetch(body: unknown = []) {
    const spy = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => (body === null ? '' : JSON.stringify(body)),
    });
    global.fetch = spy as unknown as typeof fetch;
    return spy;
  }

  function call(spy: jest.Mock, index = 0) {
    const [url, init] = spy.mock.calls[index];
    const parsed = new URL(String(url), 'http://x');
    return {
      path: parsed.pathname,
      method: (init.method ?? 'GET') as string,
      body: init.body ? JSON.parse(init.body as string) : undefined,
      auth: init.headers.Authorization as string,
    };
  }

  it('permisos: recepción no ve recetas; la asistente las lee pero no emite; plantillas solo ADMIN', () => {
    expect(canUsePrescriptions('RECEPTION')).toBe(false);
    expect(canUsePrescriptions(null)).toBe(false);
    expect(canUsePrescriptions('ASSISTANT')).toBe(true);
    expect(canIssuePrescriptions('ASSISTANT')).toBe(false);
    expect(canIssuePrescriptions('DENTIST')).toBe(true);
    expect(canIssuePrescriptions('ADMIN')).toBe(true);
    expect(canManagePrescriptionTemplates('DENTIST')).toBe(false);
    expect(canManagePrescriptionTemplates('ADMIN')).toBe(true);
  });

  it('anular: quien la emitió o un ADMIN, y solo si sigue emitida', () => {
    const rx = { status: 'ISSUED', professionalId: 'u1' } as const;
    expect(canVoidPrescription(rx, { role: 'DENTIST', userId: 'u1' })).toBe(true);
    expect(canVoidPrescription(rx, { role: 'DENTIST', userId: 'u2' })).toBe(false);
    expect(canVoidPrescription(rx, { role: 'ADMIN', userId: 'u2' })).toBe(true);
    expect(canVoidPrescription(rx, { role: 'ASSISTANT', userId: 'u1' })).toBe(false);
    expect(
      canVoidPrescription({ ...rx, status: 'VOIDED' }, { role: 'ADMIN', userId: 'u1' }),
    ).toBe(false);
  });

  it('recetas: emisor, lista, emitir, detalle y anular', async () => {
    const spy = mockFetch({});
    await getPrescriptionIssuer('tok');
    await listPatientPrescriptions('tok', 'p/1');
    await issuePrescription('tok', 'p1', { items: [{ activeIngredient: 'X' }], allergyOverride: true });
    await getPrescription('tok', 'rx1');
    await voidPrescription('tok', 'rx1', 'Error');
    expect(call(spy, 0)).toMatchObject({ method: 'GET', auth: 'Bearer tok' });
    expect(call(spy, 0).path).toMatch(/\/prescriptions\/issuer$/);
    expect(call(spy, 1).path).toMatch(/\/patients\/p%2F1\/prescriptions$/);
    expect(call(spy, 2)).toMatchObject({
      method: 'POST',
      body: { items: [{ activeIngredient: 'X' }], allergyOverride: true },
    });
    expect(call(spy, 3).path).toMatch(/\/prescriptions\/rx1$/);
    expect(call(spy, 4)).toMatchObject({ method: 'POST', body: { reason: 'Error' } });
    expect(call(spy, 4).path).toMatch(/\/prescriptions\/rx1\/void$/);
  });

  it('plantillas', async () => {
    const spy = mockFetch({});
    await listPrescriptionTemplates('tok');
    await createPrescriptionTemplate('tok', { name: 'A', items: [{ activeIngredient: 'X' }] });
    await updatePrescriptionTemplate('tok', 't1', { name: 'B' });
    mockFetch(null);
    await deletePrescriptionTemplate('tok', 't1');
    const spy2 = global.fetch as unknown as jest.Mock;
    expect(call(spy, 0).path).toMatch(/\/prescription-templates$/);
    expect(call(spy, 1)).toMatchObject({ method: 'POST', body: { name: 'A' } });
    expect(call(spy, 2)).toMatchObject({ method: 'PATCH', body: { name: 'B' } });
    expect(call(spy2, 0)).toMatchObject({ method: 'DELETE' });
  });

  it('ruta de la vista imprimible', () => {
    expect(prescriptionPrintHref('p 1', 'rx/1')).toBe('/print/patients/p%201/prescriptions/rx%2F1');
  });

  it('DX-300: previsualiza los avisos con POST …/prescriptions/safety-check', async () => {
    const spy = mockFetch({ rulesVersion: 'RX_SAFETY_V1', anamnesis: 'PRESENT', hasBlocking: false, alerts: [] });
    await checkPrescriptionSafety('tok', 'p 1', [{ activeIngredient: 'Ibuprofeno' }]);
    const { path, method, body } = call(spy);
    expect(path).toMatch(/\/patients\/p%201\/prescriptions\/safety-check$/);
    expect(method).toBe('POST');
    expect(body).toEqual({ items: [{ activeIngredient: 'Ibuprofeno' }] });
  });

  it('canManagePrescriptionSettings is ADMIN only', () => {
    expect(canManagePrescriptionSettings('ADMIN')).toBe(true);
    expect(canManagePrescriptionSettings('DENTIST')).toBe(false);
    expect(canManagePrescriptionSettings('ASSISTANT')).toBe(false);
    expect(canManagePrescriptionSettings('RECEPTION')).toBe(false);
    expect(canManagePrescriptionSettings(null)).toBe(false);
  });

  it('settings GET and PUT hit /prescriptions/settings', async () => {
    const settings = { printQuantityInWords: true, requireClinicalRecordNumber: false, validityDays: 30 };
    const spy = mockFetch(settings);
    await expect(getPrescriptionSettings('tok')).resolves.toEqual(settings);
    await savePrescriptionSettings('tok', settings);
    expect(call(spy, 0)).toMatchObject({ method: 'GET', auth: 'Bearer tok' });
    expect(call(spy, 0).path).toMatch(/\/prescriptions\/settings$/);
    expect(call(spy, 1)).toMatchObject({ method: 'PUT', body: settings, auth: 'Bearer tok' });
    expect(call(spy, 1).path).toMatch(/\/prescriptions\/settings$/);
  });
});
