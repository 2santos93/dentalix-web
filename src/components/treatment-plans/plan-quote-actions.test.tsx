import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlanQuoteActions } from './plan-quote-actions';
import { getPlanQuote } from '@/lib/treatment-plans/plan-quote-api';
import { planQuoteFixture } from './plan-quote-fixture';
import type { TreatmentPlan } from '@/lib/treatment-plans/treatment-plans-api';
import { ITEM_WITHOUT_DISCOUNT, PLAN_WITHOUT_OPTIONS } from './plan-fixture';

jest.mock('../../lib/treatment-plans/plan-quote-api', () => ({
  ...jest.requireActual('../../lib/treatment-plans/plan-quote-api'),
  getPlanQuote: jest.fn(),
}));

const mockedGet = getPlanQuote as jest.MockedFunction<typeof getPlanQuote>;

const item = {
  id: 'i1',
  tenantId: 't1',
  planId: 'plan-1',
  toothNumber: '11',
  surfaces: [],
  catalogItemId: 'c1',
  price: 100,
  discount: 0,
  ...ITEM_WITHOUT_DISCOUNT,
  status: 'PROPOSED' as const,
  notes: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

function plan(overrides: Partial<TreatmentPlan> = {}): TreatmentPlan {
  return {
    id: 'plan-1',
    tenantId: 't1',
    patientId: 'p1',
    status: 'DRAFT',
    currency: 'COP',
    notes: null,
    createdById: null,
    ...PLAN_WITHOUT_OPTIONS,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    items: [item],
    total: 100,
    acceptance: null,
    ...overrides,
  };
}

function renderActions(p: TreatmentPlan, role: 'DENTIST' | 'RECEPTION' | 'ADMIN' = 'DENTIST') {
  const onAccepted = jest.fn();
  render(<PlanQuoteActions token="tok" patientId="p1" plan={p} role={role} onAccepted={onAccepted} />);
  return onAccepted;
}

describe('PlanQuoteActions (DX-012)', () => {
  it('«Imprimir presupuesto» abre la vista A4 en otra pestaña', () => {
    renderActions(plan());
    const link = screen.getByRole('link', { name: /Imprimir presupuesto/ });
    expect(link).toHaveAttribute('href', '/print/patients/p1/treatment-plans/plan-1');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('«Aceptar con firma» abre el modal con el lienzo', async () => {
    mockedGet.mockResolvedValue(planQuoteFixture());
    renderActions(plan());
    await userEvent.click(screen.getByRole('button', { name: 'Aceptar con firma' }));
    expect(screen.getByRole('dialog', { name: 'Aceptar presupuesto con firma' })).toBeInTheDocument();
  });

  it('recepción imprime pero no acepta', () => {
    renderActions(plan(), 'RECEPTION');
    expect(screen.getByRole('link', { name: /Imprimir presupuesto/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aceptar con firma' })).not.toBeInTheDocument();
  });

  it('un plan sin ítems no se ofrece para firmar y lo explica', () => {
    renderActions(plan({ items: [], total: 0 }));
    expect(screen.queryByRole('button', { name: 'Aceptar con firma' })).not.toBeInTheDocument();
    expect(screen.getByText('Agrega procedimientos para poder aceptarlo con firma.')).toBeInTheDocument();
  });

  it('un plan cancelado no se ofrece para firmar', () => {
    renderActions(plan({ status: 'CANCELLED' }));
    expect(screen.queryByRole('button', { name: 'Aceptar con firma' })).not.toBeInTheDocument();
  });

  it('aceptado: «Aceptado y firmado por … el …», sin volver a firmar', () => {
    renderActions(
      plan({
        status: 'ACCEPTED',
        acceptance: { signerName: 'Ana Pérez', acceptedAt: '2026-10-16T15:30:00.000Z' },
      }),
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Aceptado y firmado por Ana Pérez el 16/10/2026 15:30',
    );
    expect(screen.getByText('Sus procedimientos y precios ya no se pueden cambiar.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aceptar con firma' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Imprimir presupuesto/ })).toBeInTheDocument();
  });
});
