import { deletePaymentPlan, getPaymentPlan, listCancelledPaymentPlans } from './payment-plan-api';

describe('payment-plan-api (DX-092, DX-123)', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function respond(status: number, body: string) {
    // Forma mínima de `Response` (jsdom no la trae), como en `client.test.ts`.
    const spy = jest.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => null },
      text: async () => body,
      json: async () => JSON.parse(body) as unknown,
    });
    global.fetch = spy as unknown as typeof fetch;
    return spy;
  }

  it('GET sin plan de cuotas: 200 con cuerpo vacío → null (ya no hay 404 en la consola)', async () => {
    respond(200, '');
    await expect(getPaymentPlan('tok', 'plan-1')).resolves.toBeNull();
  });

  it('GET de un plan que no existe sigue siendo un error', async () => {
    respond(404, JSON.stringify({ statusCode: 404, message: 'Plan de tratamiento no encontrado' }));
    await expect(getPaymentPlan('tok', 'plan-1')).rejects.toMatchObject({ status: 404 });
  });

  it('el historial pide /payment-plan/history', async () => {
    const spy = respond(200, '[]');
    await expect(listCancelledPaymentPlans('tok', 'plan-1')).resolves.toEqual([]);
    expect(String(spy.mock.calls[0][0])).toMatch(/\/treatment-plans\/plan-1\/payment-plan\/history$/);
  });

  it('DELETE manda el motivo y, solo si lo hay, el del período cerrado', async () => {
    const spy = respond(204, '');
    await deletePaymentPlan('tok', 'plan-1', 'Pagará de contado');
    expect(JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string)).toEqual({ reason: 'Pagará de contado' });
    await deletePaymentPlan('tok', 'plan-1', 'Pagará de contado', 'Cuota de septiembre migrada');
    expect(JSON.parse((spy.mock.calls[1][1] as RequestInit).body as string)).toEqual({
      reason: 'Pagará de contado',
      lockOverrideReason: 'Cuota de septiembre migrada',
    });
  });
});
