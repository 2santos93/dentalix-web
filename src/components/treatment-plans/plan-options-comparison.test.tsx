import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlanOptionsComparison } from './plan-options-comparison';
import { getPlan, type TreatmentPlan } from '@/lib/treatment-plans/treatment-plans-api';
import { formatCurrency } from '@/lib/format/currency';

jest.mock('../../lib/treatment-plans/treatment-plans-api', () => ({
  getPlan: jest.fn(),
}));

const mockedGetPlan = getPlan as jest.MockedFunction<typeof getPlan>;

function plan(overrides: Partial<TreatmentPlan> & { id: string }): TreatmentPlan {
  return {
    tenantId: 't1',
    patientId: 'p1',
    status: 'PRESENTED',
    currency: 'COP',
    notes: null,
    createdById: null,
    optionGroupId: 'a',
    optionLabel: null,
    presentedAt: '2026-10-07T15:00:00.000Z',
    presentedLocationId: 'loc-1',
    rejectedAt: null,
    rejectionReason: null,
    rejectionNote: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

const optionA = plan({ id: 'a', optionLabel: 'Opción A: implante' });
const optionB = plan({ id: 'b', optionLabel: 'Opción B: puente', currency: 'USD' });

function details() {
  mockedGetPlan.mockImplementation((_token, id) =>
    Promise.resolve(
      id === 'a'
        ? { ...optionA, total: 5300000, items: [{}, {}] as never }
        : { ...optionB, total: 1450.5, items: [{}, {}, {}] as never },
    ),
  );
}

// Normaliza los espacios duros de Intl (es: "150.000,50 COP" lleva U+00A0).
function money(text: string | null | undefined): string {
  return (text ?? '').replace(/\s/g, ' ');
}

describe('PlanOptionsComparison (DX-040)', () => {
  beforeEach(() => mockedGetPlan.mockReset());

  it('compara las opciones lado a lado: total en SU moneda, nº de ítems y estado', async () => {
    details();
    render(
      <PlanOptionsComparison token="tok" options={[optionA, optionB]} currentPlanId="a" onSelect={jest.fn()} />,
    );
    const a = await screen.findByRole('listitem', { name: 'Opción A: implante' });
    expect(money(a.textContent)).toContain(money(formatCurrency(5300000, 'COP')));
    expect(within(a).getByText('2 procedimientos')).toBeInTheDocument();
    expect(within(a).getByText('Presentado')).toBeInTheDocument();
    const b = screen.getByRole('listitem', { name: 'Opción B: puente' });
    expect(money(b.textContent)).toContain(money(formatCurrency(1450.5, 'USD')));
    expect(within(b).getByText('3 procedimientos')).toBeInTheDocument();
    // Monedas distintas: no se suman ni se convierten; se avisa.
    expect(
      screen.getByText('Las opciones están en monedas distintas: compara cada total en su moneda.'),
    ).toBeInTheDocument();
  });

  it('marca la opción abierta y deja abrir las otras', async () => {
    details();
    const onSelect = jest.fn();
    const user = userEvent.setup();
    render(
      <PlanOptionsComparison token="tok" options={[optionA, optionB]} currentPlanId="a" onSelect={onSelect} />,
    );
    const a = await screen.findByRole('listitem', { name: 'Opción A: implante' });
    expect(a).toHaveAttribute('aria-current', 'true');
    expect(within(a).queryByRole('button')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ver Opción B: puente' }));
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('una sola moneda: sin aviso', async () => {
    mockedGetPlan.mockImplementation((_t, id) =>
      Promise.resolve({ ...(id === 'a' ? optionA : { ...optionB, currency: 'COP' }), total: 1, items: [] }),
    );
    render(
      <PlanOptionsComparison
        token="tok"
        options={[optionA, { ...optionB, currency: 'COP' }]}
        currentPlanId="a"
        onSelect={jest.fn()}
      />,
    );
    await screen.findByRole('listitem', { name: 'Opción A: implante' });
    expect(screen.queryByText(/monedas distintas/)).not.toBeInTheDocument();
  });

  it('cargando, y si falla: error de sección con reintento', async () => {
    mockedGetPlan.mockRejectedValueOnce(new Error('red'));
    const user = userEvent.setup();
    render(
      <PlanOptionsComparison token="tok" options={[optionA, optionB]} currentPlanId="a" onSelect={jest.fn()} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Cargando la comparación…');
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar la comparación de opciones.');
    details();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() =>
      expect(screen.getByRole('listitem', { name: 'Opción A: implante' })).toBeInTheDocument(),
    );
  });
});
