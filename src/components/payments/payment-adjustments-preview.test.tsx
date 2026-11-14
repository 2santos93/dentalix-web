import { render, screen, waitFor } from '@testing-library/react';
import { PaymentAdjustmentsPreview, resetPaymentAdjustmentsPreviewCache } from './payment-adjustments-preview';
import { listCurrencies } from '@/lib/reference/currencies-api';
import type { ClinicPaymentMethod } from '@/lib/payments/payment-methods-api';
import { moneyWithCode } from '@/lib/format/sede-number';
import { stampPainters } from '@/lib/locations/sede-stamp';
import { testAgendaClock } from '@/lib/test/sede-clock';
import { STAMP_FORMATS, STAMP_SEDES } from '@/lib/test/stamp';

jest.mock('../../lib/reference/currencies-api', () => ({ listCurrencies: jest.fn() }));
const mockedCurrencies = jest.mocked(listCurrencies);

const caracas = stampPainters(testAgendaClock([STAMP_SEDES.caracas, STAMP_SEDES.berlin])).money;
const berlin = stampPainters(testAgendaClock([STAMP_SEDES.berlin, STAMP_SEDES.caracas])).money;

const METHOD = {
  id: 'pm-cash',
  name: 'Efectivo divisas',
  kind: 'CASH',
  active: true,
  requiresReference: false,
  legacyMethod: null,
  adjustments: [
    {
      id: 'adj-tax',
      paymentMethodId: 'pm-cash',
      type: 'TAX',
      label: 'Impuesto 3 %',
      calculation: 'PERCENT',
      percent: 3,
      fixedAmount: null,
      fixedCurrency: null,
      active: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as unknown as ClinicPaymentMethod;

function renderPreview(money: (amount: number, currency: string) => string, amount: number | null = 1000) {
  return render(
    <PaymentAdjustmentsPreview id="adj" token="tok" method={METHOD} amount={amount} currency="VES" money={money} />,
  );
}

describe('PaymentAdjustmentsPreview (DX-516, DX-354b)', () => {
  beforeEach(() => {
    resetPaymentAdjustmentsPreviewCache();
    mockedCurrencies.mockReset().mockResolvedValue([
      { code: 'VES', name: 'Bolívar', symbol: 'Bs.', roundingDigits: 2 },
    ] as never);
  });

  const norm = (text: string | null) => (text ?? '').replace(/\s/g, ' ');

  it('con Caracas (es-VE) los importes salen «VES 1.030,00»; con Berlín (de-DE), «1.030,00 VES»', async () => {
    const { unmount } = renderPreview(caracas);
    const region = await screen.findByRole('region', { name: 'Ajustes de este medio de pago' });
    await waitFor(() => expect(norm(region.textContent)).toContain(`+${norm(moneyWithCode(30, 'VES', STAMP_FORMATS.caracas))}`));
    expect(norm(region.textContent)).toContain(norm(moneyWithCode(1030, 'VES', STAMP_FORMATS.caracas)));
    expect(norm(region.textContent)).toContain('VES 1.030,00');
    unmount();

    renderPreview(berlin);
    const berlinRegion = await screen.findByRole('region', { name: 'Ajustes de este medio de pago' });
    await waitFor(() => expect(norm(berlinRegion.textContent)).toContain(`+${norm(moneyWithCode(30, 'VES', STAMP_FORMATS.berlin))}`));
    expect(norm(berlinRegion.textContent)).toContain('1.030,00 VES');
    expect(norm(berlinRegion.textContent)).not.toContain('VES 1.030,00');
  });

  it('sin importe aún, el total dice que se calcula al registrar el abono', async () => {
    renderPreview(caracas, null);
    expect(await screen.findByText('Se calcula al registrar el abono.')).toBeInTheDocument();
  });
});
