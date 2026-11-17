import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { PlanFinancing } from './plan-financing';
import { simulateInstallments, type InstallmentSimulation } from '@/lib/treatment-plans/installment-simulation';
import { acceptPlan, getPlanQuote } from '@/lib/treatment-plans/plan-quote-api';
import { getPatient, type Patient } from '@/lib/patients/patients-api';
import { fetchClinicName } from '@/lib/clinic-branding';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';
import { testStamp } from '@/lib/test/stamp';
import { ApiError } from '@/lib/api/client';
import type { TreatmentPlan } from '@/lib/treatment-plans/treatment-plans-api';
import { ITEM_WITHOUT_DISCOUNT, PLAN_WITHOUT_OPTIONS } from './plan-fixture';
import { planQuoteFixture, SIGNED_ACCEPTANCE } from './plan-quote-fixture';

jest.mock('../../lib/treatment-plans/installment-simulation', () => ({
  ...jest.requireActual('../../lib/treatment-plans/installment-simulation'),
  simulateInstallments: jest.fn(),
}));
jest.mock('../../lib/treatment-plans/plan-quote-api', () => ({
  ...jest.requireActual('../../lib/treatment-plans/plan-quote-api'),
  getPlanQuote: jest.fn(),
  acceptPlan: jest.fn(),
}));
jest.mock('../../lib/patients/patients-api', () => ({
  ...jest.requireActual('../../lib/patients/patients-api'),
  getPatient: jest.fn(),
}));
jest.mock('../../lib/clinic-branding', () => ({ fetchClinicName: jest.fn() }));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));

const mockedSimulate = jest.mocked(simulateInstallments);

const SEDE = clinicLocation({ timeZone: 'UTC', locale: 'es-VE', hourCycle: 'h23', currency: 'USD' });

beforeAll(() => {
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () =>
      ({
        setTransform: jest.fn(),
        clearRect: jest.fn(),
        beginPath: jest.fn(),
        moveTo: jest.fn(),
        lineTo: jest.fn(),
        stroke: jest.fn(),
      }) as unknown as CanvasRenderingContext2D,
  );
  jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => 'data:image/png;base64,FIRMA');
});

function plan(overrides: Partial<TreatmentPlan> = {}): TreatmentPlan {
  return {
    id: 'plan-1',
    tenantId: 't1',
    patientId: 'p1',
    status: 'PRESENTED',
    currency: 'USD',
    notes: null,
    createdById: null,
    ...PLAN_WITHOUT_OPTIONS,
    presentedLocationId: 'loc-1',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    items: [
      {
        id: 'i1',
        tenantId: 't1',
        planId: 'plan-1',
        toothNumber: '36',
        surfaces: [],
        catalogItemId: 'c1',
        price: 1000,
        discount: 0,
        visit: 1,
        ...ITEM_WITHOUT_DISCOUNT,
        status: 'PROPOSED' as const,
        notes: null,
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
    ],
    total: 1000,
    acceptance: null,
    ...overrides,
  } as TreatmentPlan;
}

const SIMULATION: InstallmentSimulation = {
  treatmentPlanId: 'plan-1',
  currency: 'USD',
  totalToFinance: 1000,
  scenarios: [
    {
      totalToFinance: 1000,
      downPayment: 100,
      installmentsCount: 3,
      periodicity: 'MONTHLY',
      startDate: '2026-12-01T00:00:00.000Z',
      installments: [
        { sequence: 1, dueDate: '2026-12-01T00:00:00.000Z', amount: 300 },
        { sequence: 2, dueDate: '2027-01-01T00:00:00.000Z', amount: 300 },
        { sequence: 3, dueDate: '2027-02-01T00:00:00.000Z', amount: 300 },
      ],
    },
    {
      totalToFinance: 1000,
      downPayment: 0,
      installmentsCount: 6,
      periodicity: 'BIWEEKLY',
      startDate: '2026-12-01T00:00:00.000Z',
      installments: Array.from({ length: 6 }, (_, i) => ({
        sequence: i + 1,
        dueDate: `2026-12-0${i + 1}T00:00:00.000Z`,
        amount: i === 5 ? 166.7 : 166.66,
      })),
    },
  ],
};

function renderBlock(role: 'DENTIST' | 'ASSISTANT' = 'DENTIST', p: TreatmentPlan = plan()) {
  const onAccepted = jest.fn();
  const view = render(
    <PlanFinancing
      token="tok"
      patientId="p1"
      plan={p}
      role={role}
      stamp={testStamp([SEDE])}
      onAccepted={onAccepted}
    />,
  );
  return { onAccepted, ...view };
}

const text = (el: HTMLElement) => (el.textContent ?? '').replace(/\s/g, ' ');

describe('PlanFinancing (DX-041)', () => {
  beforeEach(() => {
    mockedSimulate.mockReset();
    jest.mocked(getPlanQuote).mockReset();
    jest.mocked(acceptPlan).mockReset();
    jest.mocked(listLocations).mockResolvedValue([SEDE]);
    jest.mocked(getPatient).mockResolvedValue({
      firstName: 'Ana',
      lastName: 'Pérez',
      phone: '04121234567',
      phoneInternational: '+58 412-1234567',
    } as Patient);
    jest.mocked(fetchClinicName).mockResolvedValue('Clínica Sonrisa');
  });

  it('cerrado no pide nada; al abrirlo simula las opciones y las enseña en la moneda del plan', async () => {
    const user = userEvent.setup();
    mockedSimulate.mockResolvedValue(SIMULATION);
    renderBlock();
    expect(screen.getByRole('heading', { name: 'Financiar' })).toBeInTheDocument();
    expect(mockedSimulate).not.toHaveBeenCalled();
    expect(getPatient).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Simular cuotas' }));
    await user.click(screen.getByRole('button', { name: 'Agregar opción' }));
    await user.click(screen.getByRole('button', { name: 'Calcular cuotas' }));

    await waitFor(() => expect(mockedSimulate).toHaveBeenCalledTimes(1));
    const [, planId, scenarios] = mockedSimulate.mock.calls[0];
    expect(planId).toBe('plan-1');
    expect(scenarios).toEqual([
      expect.objectContaining({ installmentsCount: 3, periodicity: 'MONTHLY', downPayment: 0 }),
      expect.objectContaining({ installmentsCount: 6, periodicity: 'MONTHLY', downPayment: 0 }),
    ]);
    const option1 = await screen.findByTestId('financing-option-1');
    await waitFor(() => expect(text(option1)).toContain('3 × USD 300,00'));
    expect(text(option1)).toContain('Inicial de USD 100,00 y 3 cuotas mensuales de USD 300,00, desde el 01/12/2026');
    const option2 = screen.getByTestId('financing-option-2');
    expect(text(option2)).toContain('(la última de USD 166,70)');
    expect(text(screen.getByText(/Saldo que se financia/))).toContain('USD 1.000,00');
  });

  it('hasta 3 opciones: la cuarta no se ofrece', async () => {
    const user = userEvent.setup();
    renderBlock();
    await user.click(screen.getByRole('button', { name: 'Simular cuotas' }));
    await user.click(screen.getByRole('button', { name: 'Agregar opción' }));
    await user.click(screen.getByRole('button', { name: 'Agregar opción' }));
    expect(screen.queryByRole('button', { name: 'Agregar opción' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('group', { name: /^Opción \d$/ })).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: 'Quitar la opción 3' }));
    expect(screen.getAllByRole('group', { name: /^Opción \d$/ })).toHaveLength(2);
  });

  it('imprime con las opciones (en la URL, sin importes) y las envía por WhatsApp al teléfono del paciente', async () => {
    const user = userEvent.setup();
    mockedSimulate.mockResolvedValue(SIMULATION);
    renderBlock();
    await user.click(screen.getByRole('button', { name: 'Simular cuotas' }));
    await user.click(screen.getByRole('button', { name: 'Calcular cuotas' }));
    const print = await screen.findByRole('link', { name: /Imprimir con estas opciones/ });
    expect(print).toHaveAttribute(
      'href',
      `/print/patients/p1/treatment-plans/plan-1?cuotas=${encodeURIComponent('M.3.2026-12-01.100_Q.6.2026-12-01.0')}`,
    );
    const whatsapp = await screen.findByRole('link', { name: /Enviar por WhatsApp/ });
    const href = whatsapp.getAttribute('href') ?? '';
    expect(href.startsWith('https://wa.me/584121234567?text=')).toBe(true);
    const message = decodeURIComponent(href.split('?text=')[1]);
    await waitFor(() => expect(message).toContain('Hola Ana, te escribimos de Clínica Sonrisa'));
    expect(message.replace(/\s/g, ' ')).toContain('Opción 1: Inicial de USD 100,00 y 3 cuotas mensuales de USD 300,00');
    expect(message).not.toContain('—');
  });

  it('cambiar una condición deja las opciones como desactualizadas: ni imprimir ni aceptar hasta recalcular', async () => {
    const user = userEvent.setup();
    mockedSimulate.mockResolvedValue(SIMULATION);
    renderBlock();
    await user.click(screen.getByRole('button', { name: 'Simular cuotas' }));
    await user.click(screen.getByRole('button', { name: 'Calcular cuotas' }));
    await screen.findByRole('link', { name: /Imprimir con estas opciones/ });
    await user.clear(screen.getByLabelText('N.º de cuotas'));
    await user.type(screen.getByLabelText('N.º de cuotas'), '12');
    expect(screen.getByText('Cambiaste las condiciones: vuelve a calcular las cuotas.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Imprimir con estas opciones/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aceptar con esta opción' })).not.toBeInTheDocument();
  });

  it('valida las cuotas antes de pedir nada y enseña el error de la API en español', async () => {
    const user = userEvent.setup();
    renderBlock();
    await user.click(screen.getByRole('button', { name: 'Simular cuotas' }));
    await user.clear(screen.getByLabelText('N.º de cuotas'));
    await user.type(screen.getByLabelText('N.º de cuotas'), '0');
    await user.click(screen.getByRole('button', { name: 'Calcular cuotas' }));
    expect(await screen.findByText('El número de cuotas debe ser un entero entre 1 y 600.')).toBeInTheDocument();
    expect(mockedSimulate).not.toHaveBeenCalled();

    mockedSimulate.mockRejectedValue(
      new ApiError(409, 'Este plan de tratamiento ya tiene un plan de cuotas activo.'),
    );
    await user.clear(screen.getByLabelText('N.º de cuotas'));
    await user.type(screen.getByLabelText('N.º de cuotas'), '6');
    await user.click(screen.getByRole('button', { name: 'Calcular cuotas' }));
    expect(await screen.findByText('Este plan de tratamiento ya tiene un plan de cuotas activo.')).toBeInTheDocument();
  });

  it('la asistente simula e imprime, pero no acepta; con el presupuesto vencido no se acepta con cuotas', async () => {
    const user = userEvent.setup();
    mockedSimulate.mockResolvedValue(SIMULATION);
    const { unmount } = renderBlock('ASSISTANT');
    await user.click(screen.getByRole('button', { name: 'Simular cuotas' }));
    await user.click(screen.getByRole('button', { name: 'Calcular cuotas' }));
    await screen.findByRole('link', { name: /Imprimir con estas opciones/ });
    expect(screen.queryByRole('button', { name: 'Aceptar con esta opción' })).not.toBeInTheDocument();
    unmount();

    renderBlock('DENTIST', plan({ quoteExpired: true }));
    await user.click(screen.getByRole('button', { name: 'Simular cuotas' }));
    await user.click(screen.getByRole('button', { name: 'Calcular cuotas' }));
    expect(
      await screen.findAllByText('El presupuesto venció: actualiza los precios antes de aceptarlo con cuotas.'),
    ).toHaveLength(2);
  });

  it('«Aceptar con esta opción» firma el presupuesto con su plan de cuotas', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockedSimulate.mockResolvedValue(SIMULATION);
    jest.mocked(getPlanQuote).mockResolvedValue(planQuoteFixture());
    const accepted = planQuoteFixture({ planStatus: 'ACCEPTED', acceptance: SIGNED_ACCEPTANCE });
    jest.mocked(acceptPlan).mockResolvedValue(accepted);
    const { onAccepted } = renderBlock();
    await user.click(screen.getByRole('button', { name: 'Simular cuotas' }));
    await user.click(screen.getByRole('button', { name: 'Calcular cuotas' }));
    const option1 = await screen.findByTestId('financing-option-1');
    await user.click(within(option1).getByRole('button', { name: 'Aceptar con esta opción' }));

    const dialog = await screen.findByRole('dialog', { name: 'Aceptar presupuesto con firma' });
    const plan = await within(dialog).findByTestId('accept-installments');
    await waitFor(() => expect(text(plan)).toContain('Inicial de USD 100,00 y 3 cuotas mensuales de USD 300,00'));
    expect(within(dialog).getByText('Se crea al firmar, con estas cuotas y fechas.')).toBeInTheDocument();

    const canvas = within(dialog).getByRole('img', { name: 'Firma del paciente' });
    fireEvent.pointerDown(canvas, { clientX: 5, clientY: 5, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 50, clientY: 30, pointerId: 1 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });
    await user.click(within(dialog).getByRole('button', { name: 'Aceptar y firmar' }));

    await waitFor(() => expect(acceptPlan).toHaveBeenCalledTimes(1));
    expect(jest.mocked(acceptPlan).mock.calls[0][3]).toEqual(
      expect.objectContaining({
        installmentPlan: {
          downPayment: 100,
          installmentsCount: 3,
          periodicity: 'MONTHLY',
          startDate: '2026-12-01T00:00:00.000Z',
          totalToFinance: 1000,
        },
      }),
    );
    await waitFor(() => expect(onAccepted).toHaveBeenCalledWith(accepted));
  });

  it('409 INSTALLMENT_SIMULATION_STALE: lo dice y no cierra', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockedSimulate.mockResolvedValue(SIMULATION);
    jest.mocked(getPlanQuote).mockResolvedValue(planQuoteFixture());
    jest
      .mocked(acceptPlan)
      .mockRejectedValue(
        new ApiError(
          409,
          'El saldo a financiar cambió desde la simulación: vuelve a simular las cuotas con el paciente antes de firmar.',
          { code: 'INSTALLMENT_SIMULATION_STALE' },
        ),
      );
    const { onAccepted } = renderBlock();
    await user.click(screen.getByRole('button', { name: 'Simular cuotas' }));
    await user.click(screen.getByRole('button', { name: 'Calcular cuotas' }));
    await user.click(
      within(await screen.findByTestId('financing-option-1')).getByRole('button', { name: 'Aceptar con esta opción' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Aceptar presupuesto con firma' });
    await within(dialog).findByTestId('accept-installments');
    const canvas = within(dialog).getByRole('img', { name: 'Firma del paciente' });
    fireEvent.pointerDown(canvas, { clientX: 5, clientY: 5, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 50, clientY: 30, pointerId: 1 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });
    await user.click(within(dialog).getByRole('button', { name: 'Aceptar y firmar' }));
    expect(await within(dialog).findByText(/El saldo a financiar cambió desde la simulación/)).toBeInTheDocument();
    expect(onAccepted).not.toHaveBeenCalled();
    expect(getPlanQuote).toHaveBeenCalledTimes(1);
  });

  it('sin violaciones de accesibilidad con las opciones en pantalla', async () => {
    const user = userEvent.setup();
    mockedSimulate.mockResolvedValue(SIMULATION);
    const { container } = renderBlock();
    await user.click(screen.getByRole('button', { name: 'Simular cuotas' }));
    await user.click(screen.getByRole('button', { name: 'Calcular cuotas' }));
    await screen.findByRole('link', { name: /Imprimir con estas opciones/ });
    const result = await axe.run(container);
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });
});
