/**
 * Mockea el `fetch` base (mismo enfoque que consents-api.test.ts) y comprueba
 * rutas, métodos, query y cabeceras que arma cada llamada.
 */
import {
  POSTOP_VARIABLES,
  canDeliverPostOp,
  canManagePostOpTemplates,
  createPostOpTemplate,
  deliverPostOp,
  getAppointmentPostOp,
  getPatientPostOpDelivery,
  getPublicPostOp,
  listPatientPostOpDeliveries,
  listPostOpTemplates,
  loadSamplePostOpTemplates,
  markPublicPostOpOpened,
  postOpPrintHref,
  unknownVariables,
  updatePostOpTemplate,
  whatsAppUrl,
} from './postop-api';

describe('postop-api', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function mockFetch(body: unknown = []) {
    const text = body === undefined ? '' : JSON.stringify(body);
    const spy = jest.fn().mockResolvedValue({
      ok: true,
      status: body === undefined ? 204 : 200,
      json: async () => body,
      text: async () => text,
    });
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
      auth: init.headers.Authorization as string | undefined,
    };
  }

  it('lista plantillas, con el filtro de activas solo si se pide', async () => {
    const spy = mockFetch();
    await listPostOpTemplates('tok');
    await listPostOpTemplates('tok', { active: false });
    expect(call(spy, 0)).toMatchObject({ method: 'GET', query: {}, auth: 'Bearer tok' });
    expect(call(spy, 0).path).toMatch(/\/post-op-templates$/);
    expect(call(spy, 1).query).toEqual({ active: 'false' });
  });

  it('crea, edita y carga las plantillas de ejemplo', async () => {
    const spy = mockFetch({});
    await createPostOpTemplate('tok', { code: 'EXO', title: 'T', body: 'B' });
    await updatePostOpTemplate('tok', 'tpl/1', { active: false });
    await loadSamplePostOpTemplates('tok');
    expect(call(spy, 0)).toMatchObject({
      method: 'POST',
      body: { code: 'EXO', title: 'T', body: 'B' },
      auth: 'Bearer tok',
    });
    expect(call(spy, 0).path).toMatch(/\/post-op-templates$/);
    expect(call(spy, 1)).toMatchObject({ method: 'PATCH', body: { active: false } });
    expect(call(spy, 1).path).toMatch(/\/post-op-templates\/tpl%2F1$/);
    expect(call(spy, 2)).toMatchObject({ method: 'POST', auth: 'Bearer tok' });
    expect(call(spy, 2).path).toMatch(/\/post-op-templates\/samples$/);
  });

  it('indicaciones de una cita: sugerencias y entrega', async () => {
    const spy = mockFetch({});
    await getAppointmentPostOp('tok', 'a/1');
    await deliverPostOp('tok', 'a/1', { templateId: 't1', channel: 'EMAIL' });
    expect(call(spy, 0)).toMatchObject({ method: 'GET', auth: 'Bearer tok' });
    expect(call(spy, 0).path).toMatch(/\/appointments\/a%2F1\/post-op-instructions$/);
    expect(call(spy, 1)).toMatchObject({
      method: 'POST',
      body: { templateId: 't1', channel: 'EMAIL' },
    });
    expect(call(spy, 1).path).toMatch(
      /\/appointments\/a%2F1\/post-op-instructions\/deliveries$/,
    );
  });

  it('entregas del paciente: lista y detalle', async () => {
    const spy = mockFetch([]);
    await listPatientPostOpDeliveries('tok', 'p/1');
    await getPatientPostOpDelivery('tok', 'p/1', 'd/2');
    expect(call(spy, 0).path).toMatch(/\/patients\/p%2F1\/post-op-deliveries$/);
    expect(call(spy, 1).path).toMatch(/\/patients\/p%2F1\/post-op-deliveries\/d%2F2$/);
    expect(call(spy, 1).auth).toBe('Bearer tok');
  });

  it('el enlace público no envía Authorization', async () => {
    const spy = mockFetch({});
    await getPublicPostOp('abc/def');
    expect(call(spy, 0)).toMatchObject({ method: 'GET', auth: undefined });
    expect(call(spy, 0).path).toMatch(/\/public\/post-op-instructions\/abc%2Fdef$/);
  });

  it('marcar como abierto: POST sin sesión y tolera el 204 sin cuerpo', async () => {
    const spy = mockFetch(undefined);
    await expect(markPublicPostOpOpened('abc')).resolves.toBeUndefined();
    expect(call(spy, 0)).toMatchObject({ method: 'POST', auth: undefined });
    expect(call(spy, 0).path).toMatch(/\/public\/post-op-instructions\/abc\/opened$/);
  });

  it('ruta imprimible y enlace de WhatsApp reutilizado', () => {
    expect(postOpPrintHref('p/1', 'd1')).toBe('/print/patients/p%2F1/indicaciones/d1');
    expect(whatsAppUrl('573001112233', 'Hola ñ')).toBe(
      'https://wa.me/573001112233?text=Hola%20%C3%B1',
    );
  });

  it('roles: administrar plantillas solo ADMIN; entregar, cualquier rol de la clínica', () => {
    expect(canManagePostOpTemplates('ADMIN')).toBe(true);
    expect(canManagePostOpTemplates('DENTIST')).toBe(false);
    expect(canManagePostOpTemplates(null)).toBe(false);
    expect(canDeliverPostOp('RECEPTION')).toBe(true);
    expect(canDeliverPostOp('DENTIST')).toBe(true);
    expect(canDeliverPostOp(null)).toBe(false);
  });

  it('variables: mismas que la API y regla de desconocidas insensible a mayúsculas', () => {
    expect(POSTOP_VARIABLES.map((v) => v.key)).toEqual([
      'paciente',
      'profesional',
      'clinica',
      'telefono_sede',
      'fecha',
    ]);
    expect(unknownVariables('Hola {{ Paciente }} {{telefono_sede}} {{foo}} {{FOO}} {{bar}}')).toEqual([
      'foo',
      'bar',
    ]);
    expect(unknownVariables('sin variables')).toEqual([]);
    expect(unknownVariables('{{paciente2}} {{paciente}}')).toEqual(['paciente2']);
  });
});
