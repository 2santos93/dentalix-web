import { render, screen } from '@testing-library/react';
import { paymentReceiptFixture } from '@/lib/test/payment-receipt';
import type { PaymentReceipt } from '@/lib/payments/payment-receipts-api';
import { setClinicCurrencyTexts } from '@/lib/format/clinic-currency-texts';
import { PaymentReceiptDocument, receiptFormatting } from './payment-receipt-document';
import { NO_CURRENCY_TEXTS } from '@/lib/format/currency-text';

const CARACAS = { timeZone: 'America/Caracas', locale: 'es-VE', hourCycle: 'h23' } as const;

describe('receiptFormatting (DX-521)', () => {
  it('con la región de la sede pinta fechas en su zona y importes con código o texto', () => {
    const f = receiptFormatting(CARACAS, { VES: 'Bs.' });
    expect(f.available).toBe(true);
    expect(f.dateTime('2026-11-02T01:30:00.000Z')).toBe('01/11/2026 21:30');
    expect(f.date('2026-11-02T01:30:00.000Z')).toBe('01/11/2026');
    expect(f.civilDate('2026-11-02')).toBe('02/11/2026');
    expect(f.money(1234.5, 'VES')).toBe('Bs. 1.234,50');
    expect(f.money(1234.5, 'USD')).toBe('USD 1.234,50');
  });

  it('un instante ausente o no válido se pinta «—», como los helpers de antes', () => {
    const f = receiptFormatting(CARACAS, NO_CURRENCY_TEXTS);
    expect(f.dateTime(null)).toBe('—');
    expect(f.dateTime('no es una fecha')).toBe('—');
  });

  it('un día civil ausente o mal formado se pinta «—» sin lanzar, como el helper de antes', () => {
    const f = receiptFormatting(CARACAS, NO_CURRENCY_TEXTS);
    expect(f.civilDate(null)).toBe('—');
    expect(f.civilDate('no-es-fecha')).toBe('—');
    expect(f.civilDate('2026-13-45')).toBe('—');
  });

  it.each([
    ['null', null],
    ['ausente', undefined],
    ['locale que este runtime no soporta', { ...CARACAS, locale: 'xx-ZZ' }],
    ['locale mal formado', { ...CARACAS, locale: 'no es un locale' }],
    ['zona que el navegador no conoce', { ...CARACAS, timeZone: 'Mars/Olympus' }],
    ['zona vacía', { ...CARACAS, timeZone: '' }],
  ])('DX-354 (%s): fechas e importes «—», sin lanzar y sin otro formato', (_name, regional) => {
    const f = receiptFormatting(regional, { VES: 'Bs.' });
    expect(f.available).toBe(false);
    expect(f.dateTime('2026-11-02T01:30:00.000Z')).toBe('—');
    expect(f.date('2026-11-02T01:30:00.000Z')).toBe('—');
    expect(f.civilDate('2026-11-02')).toBe('—');
    expect(f.money(12345.5, 'VES')).toBe('—');
    expect(f.money(12345.5, 'USD')).toBe('—');
  });
});

const NIGHT = '2026-11-02T01:30:00.000Z';

type Regional = NonNullable<PaymentReceipt['regional']>;

/** Un recibo VES emitido de noche (UTC), con plan, anulado y tasa congelada. */
function receiptAt(regional: PaymentReceipt['regional'], overrides: Partial<PaymentReceipt['snapshot']> = {}): PaymentReceipt {
  const base = paymentReceiptFixture();
  return {
    ...base,
    regional,
    issuedAt: NIGHT,
    voided: true,
    voidedAt: NIGHT,
    voidReason: 'Cobro duplicado',
    exchangeRate: {
      status: 'FROZEN',
      rate: { currency: 'USD', fromPerBase: 40, toPerBase: 1, source: 'MANUAL', date: '2026-11-02' },
      equivalentAmount: 3750,
    } as unknown as PaymentReceipt['exchangeRate'],
    snapshot: {
      ...base.snapshot,
      payment: { ...base.snapshot.payment, amount: 150000, currency: 'VES', paidOn: '2026-11-02' },
      plan: { id: 'plan-1', optionLabel: null, createdAt: NIGHT },
      planBalance: { currency: 'VES', billable: 900000, paid: 450000, balance: 450000 },
      ...overrides,
    },
  };
}

function docText(): string {
  return (screen.getByTestId('receipt-document').textContent ?? '').replace(/\s/g, ' ');
}

const SEDES: [string, Regional, { dateTime: string; date: string; civil: string; money: string }][] = [
  ['Caracas (es-VE, 24 h)', { timeZone: 'America/Caracas', locale: 'es-VE', hourCycle: 'h23' },
    { dateTime: '01/11/2026 21:30', date: '01/11/2026', civil: '02/11/2026', money: 'VES 150.000,00' }],
  ['São Paulo (pt-BR, 24 h)', { timeZone: 'America/Sao_Paulo', locale: 'pt-BR', hourCycle: 'h23' },
    { dateTime: '01/11/2026 22:30', date: '01/11/2026', civil: '02/11/2026', money: 'VES 150.000,00' }],
  ['Londres (en-GB, 24 h)', { timeZone: 'Europe/London', locale: 'en-GB', hourCycle: 'h23' },
    { dateTime: '02/11/2026 01:30', date: '02/11/2026', civil: '02/11/2026', money: 'VES 150,000.00' }],
  ['Nueva York (en-US, 12 h)', { timeZone: 'America/New_York', locale: 'en-US', hourCycle: 'h12' },
    { dateTime: '11/01/2026 8:30 p. m.', date: '11/01/2026', civil: '11/02/2026', money: 'VES 150,000.00' }],
];

describe('recibo con el formato y la zona de su sede (DX-521)', () => {
  afterEach(() => setClinicCurrencyTexts({}));

  describe.each(['a4', '80mm'] as const)('en %s', (format) => {
    it.each(SEDES)('%s: fechas en la zona de la sede (con el navegador en UTC) e importes con código', (_n, regional, want) => {
      render(<PaymentReceiptDocument receipt={receiptAt(regional)} format={format} />);
      const text = docText();
      expect(text).toContain(`Anulado el ${want.dateTime}`);
      expect(text).toContain(`Emitido ${want.dateTime}`);
      expect(text).toContain(`plan de tratamiento del ${want.date}`);
      expect(text).toContain(`Fecha del abono${want.civil}`);
      expect(text).toContain(want.money);
      expect(text).toContain(`(manual, ${want.civil})`);
    });
  });

  it('el abono contra el saldo migrado pinta la fecha de corte con el formato de la sede', () => {
    const regional: Regional = { timeZone: 'America/New_York', locale: 'en-US', hourCycle: 'h12' };
    render(
      <PaymentReceiptDocument
        receipt={{
          ...receiptAt(regional, { openingBalance: { id: 'ob-1', concept: 'Saldo anterior', asOfDate: '2026-11-02' } }),
          snapshot: { ...receiptAt(regional).snapshot, plan: null, openingBalance: { id: 'ob-1', concept: 'Saldo anterior', asOfDate: '2026-11-02' } },
        }}
      />,
    );
    expect(docText()).toContain('Saldo migrado · Saldo anterior · corte 11/02/2026');
  });

  it('«Bs.» de la foto sale en el importe, en el equivalente y en el par de la tasa', () => {
    const regional: Regional = { timeZone: 'America/Caracas', locale: 'es-VE', hourCycle: 'h23' };
    render(<PaymentReceiptDocument receipt={receiptAt(regional, { currencyTexts: { VES: 'Bs.' } })} />);
    const text = docText();
    expect(text).toContain('Bs. 150.000,00');
    expect(text).toContain('Bs. 450.000,00');
    expect(text).toContain('1 USD = Bs. 40,00');
    expect(text).not.toContain('VES');
  });

  it('PF5: una foto sin textos no toma los de hoy de la clínica', () => {
    setClinicCurrencyTexts({ VES: 'Bs.' });
    const regional: Regional = { timeZone: 'America/Caracas', locale: 'es-VE', hourCycle: 'h23' };
    const receipt = receiptAt(regional);
    delete (receipt.snapshot as { currencyTexts?: unknown }).currencyTexts;
    render(<PaymentReceiptDocument receipt={receipt} />);
    expect(docText()).toContain('VES 150.000,00');
    expect(docText()).not.toContain('Bs.');
  });

  it('el cobro dividido pinta cada línea y su equivalente con el formato de la sede', () => {
    const regional: Regional = { timeZone: 'America/Caracas', locale: 'es-VE', hourCycle: 'h23' };
    const receipt = {
      ...receiptAt(regional, { currencyTexts: { VES: 'Bs.' } }),
      exchangeRate: null,
      split: {
        lines: [
          { paymentId: 'p1', line: 1, amount: 4000, currency: 'VES', method: 'CASH', paymentMethodName: 'Efectivo', reference: null, equivalentAmount: 100, exchangeRate: null },
          { paymentId: 'p2', line: 2, amount: 20, currency: 'USD', method: 'TRANSFER', paymentMethodName: 'Transferencia', reference: null, equivalentAmount: 800, exchangeRate: null },
        ],
        total: { currency: 'VES', amount: 4800 },
      },
    } as unknown as PaymentReceipt;
    render(<PaymentReceiptDocument receipt={receipt} />);
    const text = docText();
    expect(text).toContain('Bs. 4.800,00');
    expect(text).toContain('USD 20,00');
    expect(text).toContain('equivale a Bs. 800,00');
  });

  describe.each([
    ['sin región (null)', null],
    ['locale que este runtime no soporta', { timeZone: 'America/Caracas', locale: 'xx-ZZ', hourCycle: 'h23' }],
    ['zona que el navegador no conoce', { timeZone: 'Mars/Olympus', locale: 'es-VE', hourCycle: 'h23' }],
  ] as [string, PaymentReceipt['regional']][])('DX-354, %s', (_n, regional) => {
    it('fechas e importes «—», sin otro formato ni símbolo', () => {
      render(<PaymentReceiptDocument receipt={receiptAt(regional)} />);
      const text = docText();
      expect(text).toContain('Emitido —');
      expect(text).toContain('Anulado el —');
      expect(text).toContain('Fecha del abono—');
      expect(text).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
      expect(text).not.toMatch(/\d[.,]\d{2}/);
      expect(text).not.toContain('US$');
    });
  });

  it('regional h12 en-US: 3:05 p. m. y USD 1,234.50', () => {
    const regional: Regional = { timeZone: 'America/New_York', locale: 'en-US', hourCycle: 'h12' };
    const base = receiptAt(regional);
    render(
      <PaymentReceiptDocument
        receipt={{
          ...base,
          issuedAt: '2027-05-03T19:05:00.000Z',
          snapshot: { ...base.snapshot, payment: { ...base.snapshot.payment, amount: 1234.5, currency: 'USD' } },
        }}
      />,
    );
    const text = docText();
    expect(text).toContain('Emitido 05/03/2027 3:05 p. m.');
    expect(text).toContain('USD 1,234.50');
  });

  it('R8: la hoja sigue blanca y sin tokens de tema, con y sin región', () => {
    const regional: Regional = { timeZone: 'America/Caracas', locale: 'es-VE', hourCycle: 'h23' };
    render(<PaymentReceiptDocument receipt={receiptAt(regional)} />);
    const html = screen.getByTestId('receipt-document').outerHTML;
    expect(html).toContain('bg-white');
    expect(html).not.toMatch(/bg-background|text-foreground|text-muted|border-border|dark:/);
  });
});
