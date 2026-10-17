/**
 * DX-136: rutas del recibo de caja. Mockea el `fetch` base, como
 * payments-api.test.ts.
 */
import {
  getPaymentReceipt,
  printPaymentReceipt,
  receiptPrintHref,
  sendPaymentReceipt,
} from './payment-receipts-api';

describe('payment-receipts-api', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function mockFetch(body: unknown) {
    const spy = jest.fn().mockResolvedValue({ ok: true, json: async () => body });
    global.fetch = spy as unknown as typeof fetch;
    return spy;
  }

  it('ver: GET /payments/:id/receipt', async () => {
    const spy = mockFetch({ reference: 'NOR-000001' });
    await expect(getPaymentReceipt('tok', 'pay-1')).resolves.toEqual({ reference: 'NOR-000001' });
    const [url, init] = spy.mock.calls[0];
    expect(new URL(String(url), 'http://x').pathname).toMatch(/\/payments\/pay-1\/receipt$/);
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  it('reimprimir: POST /payments/:id/receipt/print (queda en la auditoría)', async () => {
    const spy = mockFetch({ reference: 'NOR-000001' });
    await printPaymentReceipt('tok', 'pay-1');
    const [url, init] = spy.mock.calls[0];
    expect(new URL(String(url), 'http://x').pathname).toMatch(/\/payments\/pay-1\/receipt\/print$/);
    expect(init.method).toBe('POST');
  });

  it('enviar: POST /payments/:id/receipt/email y devuelve el destino enmascarado', async () => {
    const spy = mockFetch({ sentTo: 'ca***@example.com' });
    await expect(sendPaymentReceipt('tok', 'pay-1')).resolves.toEqual({
      sentTo: 'ca***@example.com',
    });
    const [url, init] = spy.mock.calls[0];
    expect(new URL(String(url), 'http://x').pathname).toMatch(/\/payments\/pay-1\/receipt\/email$/);
    expect(init.method).toBe('POST');
  });

  it('enlace de la vista imprimible, en A4 por defecto o en tirilla de 80 mm', () => {
    expect(receiptPrintHref('pay-1')).toBe('/print/payments/pay-1/receipt');
    expect(receiptPrintHref('pay-1', 'a4')).toBe('/print/payments/pay-1/receipt');
    expect(receiptPrintHref('pay 1', '80mm')).toBe('/print/payments/pay%201/receipt?formato=80mm');
  });
});
