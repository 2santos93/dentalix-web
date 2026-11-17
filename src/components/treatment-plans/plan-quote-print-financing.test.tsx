import { render, screen, waitFor } from '@testing-library/react';
import { PlanQuotePrintView } from './plan-quote-print-view';
import { issuePlanQuote } from '@/lib/treatment-plans/plan-quote-api';
import { simulateInstallments, type InstallmentSimulation } from '@/lib/treatment-plans/installment-simulation';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';
import { ApiError } from '@/lib/api/client';
import { planQuoteFixture, SIGNED_ACCEPTANCE } from './plan-quote-fixture';

jest.mock('../../lib/treatment-plans/plan-quote-api', () => ({
  ...jest.requireActual('../../lib/treatment-plans/plan-quote-api'),
  issuePlanQuote: jest.fn(),
}));
jest.mock('../../lib/treatment-plans/installment-simulation', () => ({
  ...jest.requireActual('../../lib/treatment-plans/installment-simulation'),
  simulateInstallments: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
jest.mock('../../lib/reference/currencies-api', () => ({
  listCurrencies: jest.fn().mockResolvedValue([{ code: 'VES', name: 'Bolívar', symbol: 'Bs.' }]),
}));

const TERMS = [
  { periodicity: 'MONTHLY' as const, installmentsCount: 3, startDate: '2026-12-01T00:00:00.000Z', downPayment: 300000 },
  { periodicity: 'WEEKLY' as const, installmentsCount: 2, startDate: '2026-12-01T00:00:00.000Z', downPayment: 0 },
];

const SIMULATION: InstallmentSimulation = {
  treatmentPlanId: 'plan-1',
  currency: 'VES',
  totalToFinance: 3150000,
  scenarios: [
    {
      totalToFinance: 3150000,
      downPayment: 300000,
      installmentsCount: 3,
      periodicity: 'MONTHLY',
      startDate: '2026-12-01T00:00:00.000Z',
      installments: [
        { sequence: 1, dueDate: '2026-12-01T00:00:00.000Z', amount: 950000 },
        { sequence: 2, dueDate: '2027-01-01T00:00:00.000Z', amount: 950000 },
        { sequence: 3, dueDate: '2027-02-01T00:00:00.000Z', amount: 950000 },
      ],
    },
    {
      totalToFinance: 3150000,
      downPayment: 0,
      installmentsCount: 2,
      periodicity: 'WEEKLY',
      startDate: '2026-12-01T00:00:00.000Z',
      installments: [
        { sequence: 1, dueDate: '2026-12-01T00:00:00.000Z', amount: 1575000 },
        { sequence: 2, dueDate: '2026-12-08T00:00:00.000Z', amount: 1575000 },
      ],
    },
  ],
};

const text = (el: HTMLElement) => (el.textContent ?? '').replace(/\s/g, ' ');

describe('PlanQuotePrintView · opciones de pago (DX-041)', () => {
  const print = jest.fn();
  beforeEach(() => {
    print.mockReset();
    window.print = print;
    jest.mocked(listLocations).mockResolvedValue([clinicLocation({ currency: 'VES' })]);
    jest.mocked(issuePlanQuote).mockReset().mockResolvedValue(planQuoteFixture({ planStatus: 'PRESENTED' }));
    jest.mocked(simulateInstallments).mockReset();
  });

  it('vuelve a simular las opciones de la URL y las imprime en la moneda del plan, antes del diálogo', async () => {
    jest.mocked(simulateInstallments).mockResolvedValue(SIMULATION);
    render(
      <PlanQuotePrintView token="tok" patientId="p1" planId="plan-1" backHref="/patients/p1" financing={TERMS} />,
    );
    const block = await screen.findByTestId('quote-payment-options');
    expect(simulateInstallments).toHaveBeenCalledWith('tok', 'plan-1', TERMS);
    expect(screen.getByRole('heading', { name: 'Opciones de pago' })).toBeInTheDocument();
    const first = screen.getByTestId('quote-payment-option-1');
    expect(text(first)).toContain('VES 300.000,00');
    expect(text(first)).toContain('3 mensuales de VES 950.000,00');
    expect(text(first)).toContain('01/12/2026');
    expect(text(first)).toContain('01/02/2027');
    expect(text(screen.getByTestId('quote-payment-option-2'))).toContain('2 semanales de VES 1.575.000,00');
    expect(text(block)).toContain('Simulación sin intereses sobre VES 3.150.000,00');
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
  });

  it('sin opciones en la URL no simula ni pinta el bloque', async () => {
    render(<PlanQuotePrintView token="tok" patientId="p1" planId="plan-1" backHref="/patients/p1" />);
    await screen.findByTestId('quote-header');
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    expect(simulateInstallments).not.toHaveBeenCalled();
    expect(screen.queryByTestId('quote-payment-options')).not.toBeInTheDocument();
  });

  it('si la simulación falla, lo dice fuera del papel e imprime sin el bloque', async () => {
    jest
      .mocked(simulateInstallments)
      .mockRejectedValue(new ApiError(409, 'Este plan de tratamiento ya tiene un plan de cuotas activo.'));
    render(
      <PlanQuotePrintView token="tok" patientId="p1" planId="plan-1" backHref="/patients/p1" financing={TERMS} />,
    );
    expect(
      await screen.findByText('Sin opciones de pago: Este plan de tratamiento ya tiene un plan de cuotas activo.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('quote-payment-options')).not.toBeInTheDocument();
  });

  it('un presupuesto ya firmado se imprime como se firmó: sin opciones', async () => {
    jest.mocked(issuePlanQuote).mockResolvedValue(
      planQuoteFixture({ planStatus: 'ACCEPTED', acceptance: SIGNED_ACCEPTANCE }),
    );
    jest.mocked(simulateInstallments).mockResolvedValue(SIMULATION);
    render(
      <PlanQuotePrintView token="tok" patientId="p1" planId="plan-1" backHref="/patients/p1" financing={TERMS} />,
    );
    await screen.findByTestId('quote-header');
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('quote-payment-options')).not.toBeInTheDocument();
  });
});
