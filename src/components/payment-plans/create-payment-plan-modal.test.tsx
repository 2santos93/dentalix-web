import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreatePaymentPlanModal } from './create-payment-plan-modal';
import { ApiError } from '@/lib/api/client';
import { createPaymentPlan } from '@/lib/payment-plans/payment-plan-api';

jest.mock('../../lib/payment-plans/payment-plan-api', () => ({
  createPaymentPlan: jest.fn(),
}));

const mockedCreate = createPaymentPlan as jest.MockedFunction<typeof createPaymentPlan>;

const PLAN = { id: 'plan-1', currency: 'COP', billable: 1200000 };

beforeEach(() => {
  mockedCreate.mockReset();
});

function renderModal(props: Partial<React.ComponentProps<typeof CreatePaymentPlanModal>> = {}) {
  const onCreated = jest.fn();
  const onOpenChange = jest.fn();
  const utils = render(
    <CreatePaymentPlanModal
      open
      onOpenChange={onOpenChange}
      token="tok"
      plan={PLAN}
      onCreated={onCreated}
      {...props}
    />,
  );
  return { ...utils, onCreated, onOpenChange };
}

it('propone 12 cuotas mensuales desde hoy, sin pie y el total facturable del plan', () => {
  renderModal();
  const dialog = screen.getByRole('dialog', { name: 'Crear plan de pagos' });
  expect(within(dialog).getByLabelText('N.º de cuotas')).toHaveValue(12);
  expect(within(dialog).getByLabelText('Periodicidad')).toHaveValue('MONTHLY');
  expect(within(dialog).getByLabelText('Pie (opcional)')).toHaveValue('0');
  expect(within(dialog).getByLabelText('Total a financiar')).toHaveValue('1200000');
  // `DatePicker` (UX v2): el día ISO viaja en su campo oculto.
  expect(dialog.querySelector<HTMLInputElement>('input[name="pp-start"]')?.value).toMatch(
    /^\d{4}-\d{2}-\d{2}$/,
  );
  expect(dialog.textContent?.replace(/\s/g, ' ')).toContain('Cuota: 100.000,00 COP');
});

it('crea el plan de cuotas con los datos del formulario y avisa', async () => {
  const user = userEvent.setup();
  mockedCreate.mockResolvedValue({} as Awaited<ReturnType<typeof createPaymentPlan>>);
  const { onCreated } = renderModal();
  const dialog = screen.getByRole('dialog');

  await user.clear(within(dialog).getByLabelText('N.º de cuotas'));
  await user.type(within(dialog).getByLabelText('N.º de cuotas'), '6');
  await user.selectOptions(within(dialog).getByLabelText('Periodicidad'), 'BIWEEKLY');
  const [startDay] = within(within(dialog).getByRole('group', { name: 'Fecha de inicio' })).getAllByRole('spinbutton');
  await user.click(startDay);
  await user.keyboard('01112026');
  await user.clear(within(dialog).getByLabelText('Pie (opcional)'));
  await user.type(within(dialog).getByLabelText('Pie (opcional)'), '200000');
  await user.click(within(dialog).getByRole('button', { name: 'Crear' }));

  await waitFor(() =>
    expect(mockedCreate).toHaveBeenCalledWith('tok', 'plan-1', {
      installmentsCount: 6,
      periodicity: 'BIWEEKLY',
      startDate: '2026-11-01T00:00:00.000Z',
      downPayment: 200000,
      totalToFinance: 1200000,
    }),
  );
  expect(onCreated).toHaveBeenCalled();
});

it('valida en español antes de llamar a la API', async () => {
  const user = userEvent.setup();
  renderModal();
  const dialog = screen.getByRole('dialog');
  await user.clear(within(dialog).getByLabelText('Pie (opcional)'));
  await user.type(within(dialog).getByLabelText('Pie (opcional)'), '1300000');
  await user.click(within(dialog).getByRole('button', { name: 'Crear' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    'El pie no puede ser negativo ni mayor que el total.',
  );
  expect(mockedCreate).not.toHaveBeenCalled();
});

it('DX-241: pie y total con miles se leen como en el resto de la app', async () => {
  const user = userEvent.setup();
  mockedCreate.mockResolvedValue({} as Awaited<ReturnType<typeof createPaymentPlan>>);
  renderModal();
  const dialog = screen.getByRole('dialog');
  await user.clear(within(dialog).getByLabelText('Pie (opcional)'));
  await user.type(within(dialog).getByLabelText('Pie (opcional)'), '200.000');
  await user.clear(within(dialog).getByLabelText('Total a financiar'));
  await user.type(within(dialog).getByLabelText('Total a financiar'), '1.400.000');
  expect(dialog.textContent?.replace(/\s/g, ' ')).toContain('Financiado: 1.200.000,00 COP · Cuota: 100.000,00 COP');
  await user.click(within(dialog).getByRole('button', { name: 'Crear' }));
  await waitFor(() =>
    expect(mockedCreate).toHaveBeenCalledWith(
      'tok',
      'plan-1',
      expect.objectContaining({ downPayment: 200000, totalToFinance: 1400000 }),
    ),
  );
});

it('DX-241: un total ambiguo no se envía y el motivo sale junto al campo', async () => {
  const user = userEvent.setup();
  renderModal();
  const dialog = screen.getByRole('dialog');
  const total = within(dialog).getByLabelText('Total a financiar');
  await user.clear(total);
  await user.type(total, '1.20.000');
  await user.click(within(dialog).getByRole('button', { name: 'Crear' }));
  expect(total).toHaveAttribute('aria-invalid', 'true');
  expect(document.getElementById('pp-total-error')).toHaveTextContent('No sabemos leer «1.20.000»');
  expect(mockedCreate).not.toHaveBeenCalled();
});

it('DX-241: un facturable en COP con céntimos se propone y se envía sin tocarlo', async () => {
  const user = userEvent.setup();
  mockedCreate.mockResolvedValue({} as Awaited<ReturnType<typeof createPaymentPlan>>);
  renderModal({ plan: { id: 'plan-1', currency: 'COP', billable: 175000.5 } });
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByLabelText('Total a financiar')).toHaveValue('175000,5');
  await user.click(within(dialog).getByRole('button', { name: 'Crear' }));
  await waitFor(() =>
    expect(mockedCreate).toHaveBeenCalledWith(
      'tok',
      'plan-1',
      expect.objectContaining({ downPayment: 0, totalToFinance: 175000.5 }),
    ),
  );
});

it('un 409 se explica en español y el modal sigue abierto', async () => {
  const user = userEvent.setup();
  mockedCreate.mockRejectedValue(
    new ApiError(409, 'This treatment plan already has an active payment plan'),
  );
  const { onCreated } = renderModal();
  const dialog = screen.getByRole('dialog');
  await user.click(within(dialog).getByRole('button', { name: 'Crear' }));

  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    /ya tiene un plan de cuotas activo/i,
  );
  expect(dialog).not.toHaveTextContent(/already/i);
  expect(onCreated).not.toHaveBeenCalled();
});

it('al cambiar de plan, el total vuelve al facturable del plan nuevo', () => {
  const { rerender, onCreated, onOpenChange } = renderModal();
  rerender(
    <CreatePaymentPlanModal
      open
      onOpenChange={onOpenChange}
      token="tok"
      plan={{ id: 'plan-2', currency: 'USD', billable: 900 }}
      onCreated={onCreated}
    />,
  );
  expect(screen.getByLabelText('Total a financiar')).toHaveValue('900');
});

it('sin plan elegido no deja crear y pinta lo que se le pase encima de los campos', () => {
  renderModal({ plan: null, children: <p>Elige un plan</p> });
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByText('Elige un plan')).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'Crear' })).toBeDisabled();
});
