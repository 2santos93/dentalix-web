import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlanPresentationView } from './plan-presentation-view';
import { getPlanQuote, issuePlanQuote } from '@/lib/treatment-plans/plan-quote-api';
import { getPlan, listPlans, type TreatmentPlan } from '@/lib/treatment-plans/treatment-plans-api';
import { simulateInstallments, type InstallmentSimulation } from '@/lib/treatment-plans/installment-simulation';
import { getExchangeRates } from '@/lib/exchange/exchange-api';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';
import { ApiError } from '@/lib/api/client';
import { planQuoteFixture } from './plan-quote-fixture';
import type { PresentationMode } from '@/lib/treatment-plans/plan-presentation';

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: jest.fn() }) }));
jest.mock('../../lib/treatment-plans/plan-quote-api', () => ({
  ...jest.requireActual('../../lib/treatment-plans/plan-quote-api'),
  getPlanQuote: jest.fn(),
  issuePlanQuote: jest.fn(),
}));
jest.mock('../../lib/treatment-plans/treatment-plans-api', () => ({
  ...jest.requireActual('../../lib/treatment-plans/treatment-plans-api'),
  getPlan: jest.fn(),
  listPlans: jest.fn(),
}));
jest.mock('../../lib/treatment-plans/installment-simulation', () => ({
  ...jest.requireActual('../../lib/treatment-plans/installment-simulation'),
  simulateInstallments: jest.fn(),
}));
jest.mock('../../lib/exchange/exchange-api', () => ({ getExchangeRates: jest.fn() }));
jest.mock('../../lib/reference/currencies-api', () => ({
  listCurrencies: jest.fn().mockResolvedValue([
    { code: 'VES', name: 'Bolívar', symbol: 'Bs.' },
    { code: 'USD', name: 'Dólar', symbol: 'US$' },
  ]),
}));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));

const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s/g, ' ');

const QUOTE = planQuoteFixture({
  location: { id: 'loc-1', name: 'Sede principal', address: null },
  visitOrganization: [
    { itemId: 'i1', visit: 2, label: null, minDaysAfterPrevious: 15 },
    { itemId: 'i2', visit: 1, label: null, minDaysAfterPrevious: 0 },
  ],
  presentation: {
    language: 'es',
    items: [
      { itemId: 'i1', visit: 2, label: 'Implante para reponer la muela', language: 'es' },
      { itemId: 'i2', visit: 1, label: 'Resina en la muela', language: 'es' },
    ],
  },
});

function option(id: string, label: string, total: number): TreatmentPlan {
  return {
    id,
    patientId: 'p1',
    status: 'DRAFT',
    currency: 'VES',
    optionGroupId: 'g1',
    optionLabel: label,
    createdAt: `2026-10-0${id === 'plan-1' ? 1 : 2}T00:00:00.000Z`,
    updatedAt: '2026-10-02T00:00:00.000Z',
    items: [{ id: `${id}-i`, status: 'PROPOSED' }],
    total,
    acceptance: null,
  } as unknown as TreatmentPlan;
}

function renderView(props: Partial<React.ComponentProps<typeof PlanPresentationView>> = {}) {
  const onModeChange = jest.fn();
  const utils = render(
    <PlanPresentationView
      token="tok"
      role="DENTIST"
      patientId="p1"
      planId="plan-1"
      mode="completa"
      onModeChange={onModeChange}
      closeHref="/patients/p1?tab=treatment-plans&planId=plan-1"
      canReadPlan
      {...props}
    />,
  );
  return { ...utils, onModeChange };
}

describe('DX-560 · PlanPresentationView', () => {
  beforeEach(() => {
    jest.mocked(getPlanQuote).mockReset().mockResolvedValue(QUOTE);
    jest.mocked(issuePlanQuote).mockReset();
    jest.mocked(listPlans).mockReset().mockResolvedValue([]);
    jest.mocked(getPlan).mockReset();
    jest.mocked(simulateInstallments).mockReset();
    jest.mocked(getExchangeRates).mockReset();
    jest.mocked(listLocations).mockResolvedValue([clinicLocation({ id: 'loc-1', currency: 'VES' })]);
    push.mockReset();
  });

  it('lee el presupuesto con GET (sin emitirlo), pone el foco en el título y pinta las visitas en orden', async () => {
    renderView();
    const title = await screen.findByRole('heading', { level: 1, name: 'Plan de tratamiento' });
    await waitFor(() => expect(title).toHaveFocus());
    expect(getPlanQuote).toHaveBeenCalledWith('tok', 'p1', 'plan-1');
    expect(issuePlanQuote).not.toHaveBeenCalled();
    const visits = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(visits.slice(0, 2)).toEqual(['Visita 1', 'Visita 2']);
    expect(text(screen.getByTestId('presentation-plan-total'))).toContain('VES 3.300.000,00');
    expect(screen.getAllByRole('img', { name: /Dientes de esta visita/ })).toHaveLength(2);
  });

  it('el selector de vista avisa del cambio; Clínica no pinta importes ni la segunda moneda', async () => {
    const { onModeChange, rerender } = renderView();
    await screen.findByTestId('plan-presentation');
    await userEvent.click(screen.getByRole('radio', { name: 'Clínica' }));
    expect(onModeChange).toHaveBeenCalledWith('clinica');
    const props = (mode: PresentationMode) => ({
      token: 'tok',
      role: 'DENTIST' as const,
      patientId: 'p1',
      planId: 'plan-1',
      mode,
      onModeChange,
      closeHref: '/x',
      canReadPlan: true,
    });
    rerender(<PlanPresentationView {...props('clinica')} />);
    const article = screen.getByTestId('plan-presentation');
    expect(text(article)).not.toMatch(/VES|Total/);
    expect(screen.queryByLabelText('Segunda moneda')).not.toBeInTheDocument();
    rerender(<PlanPresentationView {...props('economica')} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(text(screen.getByTestId('plan-presentation'))).not.toMatch(/Diente/);
  });

  it('segunda moneda orientativa con la tasa de hoy, su fuente y su fecha', async () => {
    jest.mocked(getExchangeRates).mockImplementation((_t, date) =>
      Promise.resolve({ base: 'USD', source: 'MANUAL', rates: { VES: 4000 }, rateDate: date }),
    );
    renderView();
    await screen.findByTestId('plan-presentation');
    await screen.findByRole('option', { name: /Dólar/ });
    await userEvent.selectOptions(screen.getByLabelText('Segunda moneda'), 'USD');
    const second = await screen.findByTestId('presentation-second-total');
    expect(text(second)).toContain('USD 825,00');
    expect(text(screen.getByTestId('presentation-plan-total'))).toMatch(/Tasa de hoy: 1 USD = VES 4\.000,00 \(manual, \d{2}\/\d{2}\/\d{4}\)/);
  });

  it('por defecto, la moneda de la sede si no es la del plan', async () => {
    jest.mocked(listLocations).mockResolvedValue([clinicLocation({ id: 'loc-1', currency: 'USD' })]);
    jest.mocked(getExchangeRates).mockImplementation((_t, date) =>
      Promise.resolve({ base: 'USD', source: 'AUTOMATIC', rates: { VES: 4000 }, rateDate: date }),
    );
    renderView();
    expect(await screen.findByTestId('presentation-second-total')).toHaveTextContent(/USD/);
  });

  it('las cuotas de «Financiar» se vuelven a simular y salen en Completa', async () => {
    const simulation: InstallmentSimulation = {
      treatmentPlanId: 'plan-1',
      currency: 'VES',
      totalToFinance: 3300000,
      scenarios: [
        {
          totalToFinance: 3300000,
          downPayment: 300000,
          installmentsCount: 3,
          periodicity: 'MONTHLY',
          startDate: '2026-12-01T00:00:00.000Z',
          installments: [1, 2, 3].map((n) => ({ sequence: n, dueDate: `2027-0${n}-01T00:00:00.000Z`, amount: 1000000 })),
        },
      ],
    };
    jest.mocked(simulateInstallments).mockResolvedValue(simulation);
    const terms = [{ installmentsCount: 3, periodicity: 'MONTHLY' as const, startDate: '2026-12-01T12:00:00.000Z', downPayment: 300000 }];
    renderView({ financing: terms });
    const block = await screen.findByTestId('presentation-financing');
    await waitFor(() => expect(text(block)).toContain('Opción 1: Inicial de VES 300.000,00 y 3 cuotas mensuales'));
    expect(simulateInstallments).toHaveBeenCalledWith('tok', 'plan-1', terms);
  });

  it('Escape vuelve a la ficha, como «Cerrar»', async () => {
    renderView();
    await screen.findByTestId('plan-presentation');
    expect(screen.getByRole('link', { name: /Cerrar/ })).toHaveAttribute(
      'href',
      '/patients/p1?tab=treatment-plans&planId=plan-1',
    );
    await act(async () => {
      await userEvent.keyboard('{Escape}');
    });
    expect(push).toHaveBeenCalledWith('/patients/p1?tab=treatment-plans&planId=plan-1');
  });

  it('alternativas A/B lado a lado; «Elegir esta opción» vuelve a la ficha con la aceptación abierta', async () => {
    jest.mocked(listPlans).mockResolvedValue([option('plan-1', 'Opción A', 3300000), option('plan-2', 'Opción B', 1200000)]);
    jest.mocked(getPlan).mockImplementation(async (_t, id) =>
      id === 'plan-1' ? option('plan-1', 'Opción A', 3300000) : option('plan-2', 'Opción B', 1200000),
    );
    renderView();
    expect(await screen.findByText(/Opción: Opción A/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ver alternativas' }));
    const list = await screen.findByTestId('presentation-alternatives');
    const cards = within(list).getAllByRole('listitem');
    expect(cards.map((c) => c.getAttribute('aria-label'))).toEqual(['Opción A', 'Opción B']);
    expect(text(cards[1])).toContain('VES 1.200.000,00');
    expect(within(cards[1]).getByRole('link', { name: 'Elegir Opción B' })).toHaveAttribute(
      'href',
      '/patients/p1?tab=treatment-plans&planId=plan-2&aceptar=1',
    );
  });

  it('un rol que no acepta ve las alternativas sin «Elegir»', async () => {
    jest.mocked(listPlans).mockResolvedValue([option('plan-1', 'Opción A', 1), option('plan-2', 'Opción B', 2)]);
    jest.mocked(getPlan).mockImplementation(async (_t, id) => option(id, id === 'plan-1' ? 'Opción A' : 'Opción B', 1));
    renderView({ role: 'ASSISTANT' });
    await userEvent.click(await screen.findByRole('button', { name: 'Ver alternativas' }));
    await screen.findByTestId('presentation-alternatives');
    expect(screen.queryByRole('link', { name: /Elegir/ })).not.toBeInTheDocument();
  });

  it('404 → aviso sin reintento', async () => {
    jest.mocked(getPlanQuote).mockRejectedValue(new ApiError(404, 'no'));
    renderView();
    expect(await screen.findByText('No encontramos este plan.')).toBeInTheDocument();
  });
});
