import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreditBalanceSection } from './credit-balance-section';
import { accountStatementFixture } from '@/lib/test/account-statement';
import { refundCredit, transferCredit } from '@/lib/patient-credit/patient-credit-api';
import type { AccountStatement } from '@/lib/account-statement/account-statement-api';

jest.mock('../../lib/patient-credit/patient-credit-api', () => ({
  ...jest.requireActual('../../lib/patient-credit/patient-credit-api'),
  transferCredit: jest.fn(),
  refundCredit: jest.fn(),
}));

const mockedTransfer = transferCredit as jest.MockedFunction<typeof transferCredit>;
const mockedRefund = refundCredit as jest.MockedFunction<typeof refundCredit>;

/** Un plan COP cancelado con 300.000 abonados y uno vivo que debe 400.000. */
function copCredit(): AccountStatement {
  const base = accountStatementFixture();
  const [live] = base.plans;
  return {
    ...base,
    plans: [
      { ...live, id: 'live', budgeted: 400000, paid: 0, balance: 400000 },
      {
        ...live,
        id: 'cancelled',
        status: 'CANCELLED',
        countsTowardsBalance: false,
        paid: 300000,
        balance: -300000,
      },
    ],
    movements: [
      { ...base.movements[1], id: 'pay-c', amount: 300000, treatmentPlanId: 'cancelled' },
    ],
  };
}

const planName = (id: string) => `Plan ${id}`;

function renderSection(statement: AccountStatement, canAct = true) {
  const onTransferred = jest.fn();
  const onRefunded = jest.fn();
  render(
    <CreditBalanceSection
      token="tok"
      statement={statement}
      planName={planName}
      canAct={canAct}
      onTransferred={onTransferred}
      onRefunded={onRefunded}
    />,
  );
  return { onTransferred, onRefunded };
}

beforeEach(() => {
  mockedTransfer.mockReset();
  mockedRefund.mockReset();
  Object.defineProperty(globalThis, 'crypto', {
    value: { randomUUID: () => '00000000-0000-4000-8000-000000000001' },
    configurable: true,
  });
});

it('muestra una fila por plan con saldo a favor y sus dos acciones', () => {
  renderSection(copCredit());
  const row = screen.getByTestId('credit-row');
  expect(row).toHaveTextContent('Plan cancelled');
  expect(row).toHaveTextContent(/a favor/);
  expect(within(row).getByRole('button', { name: /Aplicar a otro plan/ })).toBeInTheDocument();
  expect(within(row).getByRole('button', { name: /Devolver/ })).toBeInTheDocument();
});

it('sin permiso (DENTIST/ASSISTANT) no pinta las acciones; sin saldo a favor, nada', () => {
  const { unmount } = render(
    <CreditBalanceSection
      token="tok"
      statement={copCredit()}
      planName={planName}
      canAct={false}
      onTransferred={jest.fn()}
      onRefunded={jest.fn()}
    />,
  );
  expect(screen.queryByRole('button', { name: /Devolver/ })).not.toBeInTheDocument();
  unmount();
  const statement = copCredit();
  renderSection({ ...statement, plans: [statement.plans[0]] });
  expect(screen.queryByTestId('credit-balance')).not.toBeInTheDocument();
});

it('aplicar a otro plan: vista previa del saldo resultante y envío con Idempotency-Key', async () => {
  const user = userEvent.setup();
  mockedTransfer.mockResolvedValue({} as never);
  const { onTransferred } = renderSection(copCredit());
  await user.click(screen.getByRole('button', { name: /Aplicar a otro plan/ }));
  const dialog = screen.getByRole('dialog');
  await user.type(within(dialog).getByLabelText('Importe a aplicar'), '200000');
  const preview = within(dialog).getByRole('region', { name: 'Vista previa' });
  expect(preview).toHaveTextContent(/Saldo a favor que queda.*100\.000/);
  expect(preview).toHaveTextContent(/Saldo de Plan live después.*200\.000/);
  await user.click(within(dialog).getByRole('button', { name: 'Aplicar al plan' }));
  await waitFor(() => expect(onTransferred).toHaveBeenCalled());
  expect(mockedTransfer).toHaveBeenCalledWith(
    'tok',
    'cancelled',
    { targetPlanId: 'live', amount: 200000, currency: 'COP' },
    '00000000-0000-4000-8000-000000000001',
  );
});

it('aplicar más que el saldo a favor: error en el campo, sin llamar a la API', async () => {
  const user = userEvent.setup();
  renderSection(copCredit());
  await user.click(screen.getByRole('button', { name: /Aplicar a otro plan/ }));
  const dialog = screen.getByRole('dialog');
  await user.type(within(dialog).getByLabelText('Importe a aplicar'), '300001');
  await user.click(within(dialog).getByRole('button', { name: 'Aplicar al plan' }));
  expect(await within(dialog).findByText(/No puede superar el saldo a favor/)).toBeInTheDocument();
  expect(mockedTransfer).not.toHaveBeenCalled();
});

it('devolver: motivo obligatorio y abonos de referencia; el comprobante vuelve a quien lo abrió', async () => {
  const user = userEvent.setup();
  const refund = { id: 'r-1', number: 'DEV-NOR-000001' };
  mockedRefund.mockResolvedValue(refund as never);
  const { onRefunded } = renderSection(copCredit());
  await user.click(screen.getByRole('button', { name: /Devolver/ }));
  const dialog = screen.getByRole('dialog');
  await user.type(within(dialog).getByLabelText('Importe a devolver'), '50000');
  await user.click(within(dialog).getByRole('button', { name: 'Devolver' }));
  expect(await within(dialog).findByText(/Escribe el motivo/)).toBeInTheDocument();
  expect(mockedRefund).not.toHaveBeenCalled();
  expect(within(dialog).getByRole('region', { name: 'Vista previa' })).toHaveTextContent(/250\.000/);

  fireEvent.change(within(dialog).getByLabelText('Motivo'), {
    target: { value: 'El paciente se muda' },
  });
  fireEvent.change(within(dialog).getByLabelText('Cómo se devuelve'), {
    target: { value: 'TRANSFER' },
  });
  await user.click(within(dialog).getByRole('button', { name: 'Devolver' }));
  await waitFor(() => expect(onRefunded).toHaveBeenCalledWith(refund));
  expect(mockedRefund).toHaveBeenCalledWith(
    'tok',
    'cancelled',
    {
      amount: 50000,
      currency: 'COP',
      method: 'TRANSFER',
      reason: 'El paciente se muda',
      paymentIds: ['pay-c'],
    },
    '00000000-0000-4000-8000-000000000001',
  );
});

it('devolver sin abonos marcados: aviso y sin llamar a la API', async () => {
  const user = userEvent.setup();
  renderSection(copCredit());
  await user.click(screen.getByRole('button', { name: /Devolver/ }));
  const dialog = screen.getByRole('dialog');
  await user.click(within(dialog).getByRole('checkbox'));
  await user.type(within(dialog).getByLabelText('Importe a devolver'), '1000');
  fireEvent.change(within(dialog).getByLabelText('Motivo'), { target: { value: 'Motivo' } });
  await user.click(within(dialog).getByRole('button', { name: 'Devolver' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(/al menos un abono/);
  expect(mockedRefund).not.toHaveBeenCalled();
});

it('aplicar a otro plan: una nota de menos de 3 caracteres se avisa sin llamar a la API', async () => {
  const user = userEvent.setup();
  renderSection(copCredit());
  await user.click(screen.getByRole('button', { name: /Aplicar a otro plan/ }));
  const dialog = screen.getByRole('dialog');
  await user.type(within(dialog).getByLabelText('Importe a aplicar'), '1000');
  fireEvent.change(within(dialog).getByLabelText('Nota (opcional)'), { target: { value: 'ok' } });
  await user.click(within(dialog).getByRole('button', { name: 'Aplicar al plan' }));
  expect(await within(dialog).findByText(/al menos 3 caracteres/)).toBeInTheDocument();
  expect(mockedTransfer).not.toHaveBeenCalled();
});

it('devolver con más de 20 abonos vivos: ninguno marcado de entrada y tope de 20 al enviar', async () => {
  const user = userEvent.setup();
  const statement = copCredit();
  const many = Array.from({ length: 21 }, (_, i) => ({
    ...statement.movements[0],
    id: `pay-${String(i).padStart(2, '0')}`,
    amount: 1000,
  }));
  renderSection({ ...statement, movements: many });
  await user.click(screen.getByRole('button', { name: /Devolver/ }));
  const dialog = screen.getByRole('dialog');
  const boxes = within(dialog).getAllByRole('checkbox');
  expect(boxes).toHaveLength(21);
  expect(boxes.filter((b) => (b as HTMLInputElement).checked)).toHaveLength(0);
  for (const box of boxes) await user.click(box);
  await user.type(within(dialog).getByLabelText('Importe a devolver'), '1000');
  fireEvent.change(within(dialog).getByLabelText('Motivo'), { target: { value: 'Motivo' } });
  await user.click(within(dialog).getByRole('button', { name: 'Devolver' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(/como máximo 20/);
  expect(mockedRefund).not.toHaveBeenCalled();
});
