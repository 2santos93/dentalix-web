import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/client';
import { Toaster } from '@/components/errors/toaster';
import { formatCurrency } from '@/lib/format/currency';
import {
  getPaymentAllocations,
  replacePaymentAllocations,
  type PaymentAllocations,
} from '@/lib/payments/payment-allocations-api';
import { ReallocatePaymentModal } from './reallocate-payment-modal';

jest.mock('../../lib/payments/payment-allocations-api', () => ({
  getPaymentAllocations: jest.fn(),
  replacePaymentAllocations: jest.fn(),
}));

const mockedGet = jest.mocked(getPaymentAllocations);
const mockedPut = jest.mocked(replacePaymentAllocations);

/** Lo que pinta `formatCurrency`, con el espacio duro de Intl como espacio normal (así compara Testing Library). */
function money(amount: number, currency: string): string {
  return formatCurrency(amount, currency).replace(/ /g, ' ');
}

const VERSION = 'b'.repeat(64);

// Abono de 120 USD a un plan en EUR: 108,50 € con la tasa de su día.
const DATA: PaymentAllocations = {
  paymentId: 'pay-1',
  receiptNumber: 'NOR-000123',
  treatmentPlanId: 'plan-1',
  paymentAmount: 120,
  paymentCurrency: 'USD',
  paidOn: '2026-10-20',
  planCurrency: 'EUR',
  planStatus: 'ACCEPTED',
  planAmount: 108.5,
  manual: true,
  allocated: 60,
  unallocated: 48.5,
  version: VERSION,
  allocations: [{ treatmentPlanItemId: 'item-2', amount: 60, source: 'MANUAL' }],
  items: [
    {
      itemId: 'item-1',
      toothNumber: '11',
      procedureName: 'Resina',
      status: 'DONE',
      billable: 100,
      paidByOthers: 30,
      free: 70,
    },
    {
      itemId: 'item-2',
      toothNumber: '26',
      procedureName: 'Limpieza',
      status: 'ACCEPTED',
      billable: 80,
      paidByOthers: 0,
      free: 80,
    },
  ],
};

function renderModal(overrides: Partial<React.ComponentProps<typeof ReallocatePaymentModal>> = {}) {
  const props: React.ComponentProps<typeof ReallocatePaymentModal> = {
    open: true,
    onOpenChange: jest.fn(),
    paymentId: 'pay-1',
    token: 'tok',
    onSaved: jest.fn(),
    ...overrides,
  };
  render(
    <>
      <ReallocatePaymentModal {...props} />
      <Toaster />
    </>,
  );
  return props;
}

async function dialog() {
  return screen.findByRole('dialog', { name: 'Imputar abono' });
}

/** Espera a que cargue la imputación (el campo de modo ya está). */
async function loaded() {
  return screen.findByRole('radio', { name: /fijar a mano/i });
}

describe('ReallocatePaymentModal (DX-051)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGet.mockResolvedValue(DATA);
  });

  it('subtitle shows receipt number, amount and civil date', async () => {
    renderModal();
    const modal = await dialog();
    await loaded();
    expect(within(modal).getByText(`NOR-000123 · ${money(120, 'USD')} · 20/10/2026`)).toBeInTheDocument();
  });

  it('subtitle without receipt series shows only amount and date', async () => {
    mockedGet.mockResolvedValue({ ...DATA, receiptNumber: null });
    renderModal();
    const modal = await dialog();
    await loaded();
    expect(within(modal).getByText(`${money(120, 'USD')} · 20/10/2026`)).toBeInTheDocument();
  });

  it('shows Disponible para imputar and the conversion line for another currency', async () => {
    renderModal();
    await loaded();
    expect(screen.getByText(`Disponible para imputar: ${money(108.5, 'EUR')}`)).toBeInTheDocument();
    expect(
      screen.getByText(`Convertido de ${money(120, 'USD')} con la tasa del 20/10/2026.`),
    ).toBeInTheDocument();
  });

  it('no conversion line when the payment is in the plan currency', async () => {
    mockedGet.mockResolvedValue({ ...DATA, paymentCurrency: 'EUR', paymentAmount: 108.5 });
    renderModal();
    await loaded();
    expect(screen.getByText(`Disponible para imputar: ${money(108.5, 'EUR')}`)).toBeInTheDocument();
    expect(screen.queryByText(/^Convertido de/)).not.toBeInTheDocument();
  });

  it('starts in the mode the payment has: Fijar a mano when pinned, Reparto automático otherwise', async () => {
    const { unmount } = render(
      <ReallocatePaymentModal open onOpenChange={jest.fn()} paymentId="pay-1" token="tok" onSaved={jest.fn()} />,
    );
    expect(await loaded()).toBeChecked();
    unmount();

    mockedGet.mockResolvedValue({ ...DATA, manual: false });
    renderModal();
    expect(await screen.findByRole('radio', { name: /reparto automático/i })).toBeChecked();
    expect(
      screen.getByText('Se reparte solo, primero lo realizado y del abono más antiguo al más reciente.'),
    ).toBeInTheDocument();
    // Sin campos de importe en automático.
    expect(screen.queryByLabelText(/^Importe para/)).not.toBeInTheDocument();
  });

  it('Reparto automático submits mode AUTO without allocations', async () => {
    mockedPut.mockResolvedValue({ ...DATA, manual: false, previous: [] });
    const user = userEvent.setup();
    renderModal();
    await loaded();

    await user.click(screen.getByRole('radio', { name: /reparto automático/i }));
    await user.click(screen.getByRole('button', { name: 'Guardar imputación' }));

    await waitFor(() => expect(mockedPut).toHaveBeenCalledTimes(1));
    const [token, paymentId, body] = mockedPut.mock.calls[0];
    expect(token).toBe('tok');
    expect(paymentId).toBe('pay-1');
    expect(body).toEqual({ expectedVersion: VERSION, mode: 'AUTO' });
    expect(body).not.toHaveProperty('allocations');
  });

  it('Fijar a mano shows item inputs with accessible labels', async () => {
    renderModal();
    await loaded();

    const resina = screen.getByLabelText('Importe para Resina del diente 11');
    const limpieza = screen.getByLabelText('Importe para Limpieza del diente 26');
    for (const field of [resina, limpieza]) {
      expect(field).toHaveAttribute('inputmode', 'decimal');
      expect(field).toHaveAttribute('type', 'text');
    }
    // Arranca con la imputación actual del abono.
    expect(resina).toHaveValue('');
    expect(limpieza).toHaveValue('60');

    const table = screen.getByRole('table', { name: 'Ítems imputables del plan' });
    const row = within(table).getByText('Resina').closest('tr') as HTMLTableRowElement;
    expect(within(row).getByText('11')).toBeInTheDocument();
    expect(within(row).getByText('Realizado')).toBeInTheDocument();
    // «Libre para este abono»: lo que este abono todavía puede cubrir del ítem.
    expect(within(row).getByText(money(70, 'EUR'))).toBeInTheDocument();
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(headers).toEqual(['Procedimiento', 'Diente', 'Estado', 'Libre para este abono', 'Importe']);
  });

  it('a fee item without tooth is labelled by its procedure alone', async () => {
    mockedGet.mockResolvedValue({
      ...DATA,
      items: [{ ...DATA.items[0], itemId: 'item-fee', toothNumber: '', procedureName: 'Cargo por inasistencia' }],
      allocations: [],
    });
    renderModal();
    await loaded();
    expect(screen.getByLabelText('Importe para Cargo por inasistencia')).toBeInTheDocument();
    expect(screen.getByText('Sin diente')).toBeInTheDocument();
  });

  it('Dejar sin imputar clears all', async () => {
    const user = userEvent.setup();
    renderModal();
    await loaded();
    await user.type(screen.getByLabelText('Importe para Resina del diente 11'), '10');

    await user.click(screen.getByRole('button', { name: 'Dejar sin imputar' }));

    expect(screen.getByLabelText('Importe para Resina del diente 11')).toHaveValue('');
    expect(screen.getByLabelText('Importe para Limpieza del diente 26')).toHaveValue('');
    expect(screen.getByText(`Imputado ${money(0, 'EUR')} · Sin imputar ${money(108.5, 'EUR')}`)).toBeInTheDocument();
  });

  it('live footer shows Imputado and Sin imputar and alerts when over', async () => {
    const user = userEvent.setup();
    renderModal();
    await loaded();

    const footer = screen.getByText(`Imputado ${money(60, 'EUR')} · Sin imputar ${money(48.5, 'EUR')}`);
    expect(footer.closest('[role="alert"]')).toBeNull();

    await user.type(screen.getByLabelText('Importe para Resina del diente 11'), '50,25');
    const over = await screen.findByText(
      `Imputado ${money(110.25, 'EUR')} · Sin imputar ${money(-1.75, 'EUR')}`,
    );
    // Solo el aviso es alerta; el Σ, que cambia con cada tecla, no.
    expect(over.closest('[role="alert"]')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(`La suma supera el abono en ${money(1.75, 'EUR')}.`);
  });

  it('a line above what the item admits says so on its own row', async () => {
    const user = userEvent.setup();
    renderModal();
    await loaded();
    const field = screen.getByLabelText('Importe para Resina del diente 11');
    await user.type(field, '70');
    expect(screen.queryByText(`Este ítem admite como máximo ${money(70, 'EUR')}.`)).not.toBeInTheDocument();

    await user.type(field, ',01');
    const hint = screen.getByText(`Este ítem admite como máximo ${money(70, 'EUR')}.`);
    expect(hint.closest('tr')).toBe(within(screen.getByRole('table')).getByText('Resina').closest('tr'));
    expect((field.getAttribute('aria-describedby') ?? '').split(' ')).toContain(hint.id);
  });

  it('submits expectedVersion and the manual lines in plan order', async () => {
    mockedPut.mockResolvedValue({ ...DATA, previous: [] });
    const user = userEvent.setup();
    renderModal();
    await loaded();

    await user.type(screen.getByLabelText('Importe para Resina del diente 11'), '40,5');
    const limpieza = screen.getByLabelText('Importe para Limpieza del diente 26');
    await user.clear(limpieza);
    await user.type(limpieza, '1.000');
    await user.clear(limpieza);
    await user.type(limpieza, '25');
    await user.click(screen.getByRole('button', { name: 'Guardar imputación' }));

    await waitFor(() => expect(mockedPut).toHaveBeenCalledTimes(1));
    expect(mockedPut.mock.calls[0][2]).toEqual({
      expectedVersion: VERSION,
      mode: 'MANUAL',
      allocations: [
        { treatmentPlanItemId: 'item-1', amount: 40.5 },
        { treatmentPlanItemId: 'item-2', amount: 25 },
      ],
    });
  });

  it('manual with every field empty sends an empty list (all unallocated)', async () => {
    mockedPut.mockResolvedValue({ ...DATA, previous: [] });
    const user = userEvent.setup();
    renderModal();
    await loaded();
    await user.click(screen.getByRole('button', { name: 'Dejar sin imputar' }));
    await user.click(screen.getByRole('button', { name: 'Guardar imputación' }));

    await waitFor(() => expect(mockedPut).toHaveBeenCalledTimes(1));
    expect(mockedPut.mock.calls[0][2]).toEqual({ expectedVersion: VERSION, mode: 'MANUAL', allocations: [] });
  });

  it('an amount it cannot read blocks the save and says why next to the field', async () => {
    const user = userEvent.setup();
    renderModal();
    await loaded();
    const field = screen.getByLabelText('Importe para Resina del diente 11');
    await user.type(field, '1.50.0');
    await user.click(screen.getByRole('button', { name: 'Guardar imputación' }));

    expect(field).toHaveAttribute('aria-invalid', 'true');
    const describedBy = (field.getAttribute('aria-describedby') ?? '').split(' ');
    const error = describedBy.map((id) => document.getElementById(id)).find((el) => el?.getAttribute('role') === 'alert');
    expect(error).toBeTruthy();
    expect(mockedPut).not.toHaveBeenCalled();
  });

  it('a failed validation moves focus to the first invalid field', async () => {
    const user = userEvent.setup();
    renderModal();
    await loaded();
    const limpieza = screen.getByLabelText('Importe para Limpieza del diente 26');
    await user.clear(limpieza);
    await user.type(limpieza, '1.50.0');
    await user.type(screen.getByLabelText('Importe para Resina del diente 11'), 'abc');
    await user.click(screen.getByRole('button', { name: 'Guardar imputación' }));

    // En el orden del plan: Resina va antes que Limpieza.
    expect(screen.getByLabelText('Importe para Resina del diente 11')).toHaveFocus();
  });

  it('409 version shows server message and Volver a cargar reloads', async () => {
    const message =
      'La imputación de este abono cambió mientras la editabas. Revisa los importes y vuelve a guardar.';
    mockedPut.mockRejectedValue(new ApiError(409, message));
    const user = userEvent.setup();
    const props = renderModal();
    await loaded();

    await user.click(screen.getByRole('button', { name: 'Guardar imputación' }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(props.onOpenChange).not.toHaveBeenCalled();

    mockedGet.mockResolvedValue({
      ...DATA,
      version: 'c'.repeat(64),
      allocations: [{ treatmentPlanItemId: 'item-1', amount: 70, source: 'MANUAL' }],
    });
    await user.click(screen.getByRole('button', { name: 'Volver a cargar' }));

    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2));
    expect(await screen.findByLabelText('Importe para Resina del diente 11')).toHaveValue('70');
    expect(screen.getByLabelText('Importe para Limpieza del diente 26')).toHaveValue('');
    expect(screen.queryByText(message)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Volver a cargar' })).not.toBeInTheDocument();
    // El foco no se pierde: va al primer campo de la lectura nueva.
    await waitFor(() => expect(screen.getByLabelText('Importe para Resina del diente 11')).toHaveFocus());
  });

  it('a 409 whose reload brings the same allocation keeps its explanation', async () => {
    const message = 'Este abono es de un saldo migrado: no se imputa a ítems de un plan.';
    mockedPut.mockRejectedValue(new ApiError(409, message));
    const user = userEvent.setup();
    renderModal();
    await loaded();
    await user.click(screen.getByRole('button', { name: 'Guardar imputación' }));
    await user.click(await screen.findByRole('button', { name: 'Volver a cargar' }));

    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Volver a cargar' })).not.toBeInTheDocument());
    expect(screen.getByText(message)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Importe para Resina del diente 11')).toHaveFocus());
  });

  it('a 400 from the server is shown as is and offers no reload', async () => {
    const message = 'Un ítem admite como máximo 70.00 EUR: el resto ya lo cubren otros abonos.';
    mockedPut.mockRejectedValue(new ApiError(400, 'Bad Request', { messages: [message] }));
    const user = userEvent.setup();
    renderModal();
    await loaded();
    await user.click(screen.getByRole('button', { name: 'Guardar imputación' }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Volver a cargar' })).not.toBeInTheDocument();
  });

  it('planAmount null explains no rate and hides Guardar imputación', async () => {
    mockedGet.mockResolvedValue({ ...DATA, planAmount: null, unallocated: null, allocations: [] });
    renderModal();
    const modal = await dialog();
    expect(
      await within(modal).findByText(
        'No hay tasa de cambio para la fecha de este abono: todavía no se puede imputar.',
      ),
    ).toBeInTheDocument();
    expect(within(modal).queryByRole('button', { name: 'Guardar imputación' })).not.toBeInTheDocument();
    expect(within(modal).queryByRole('radio')).not.toBeInTheDocument();
    expect(within(modal).getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });

  it('a cancelled plan says its payments are not allocated and hides the save', async () => {
    mockedGet.mockResolvedValue({ ...DATA, planStatus: 'CANCELLED', items: [], allocations: [] });
    renderModal();
    const modal = await dialog();
    expect(
      await within(modal).findByText('El plan está «Cancelado»: sus abonos no se imputan a ítems.'),
    ).toBeInTheDocument();
    expect(within(modal).queryByRole('button', { name: 'Guardar imputación' })).not.toBeInTheDocument();
  });

  it('empty items shows empty-state copy', async () => {
    mockedGet.mockResolvedValue({ ...DATA, items: [], allocations: [], manual: false });
    renderModal();
    await screen.findByRole('radio', { name: /reparto automático/i });
    expect(
      screen.getByText('Este plan no tiene ítems aceptados ni realizados: el abono queda sin imputar.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('a failed load is a section error with retry, and nothing to save', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError(500, 'Internal server error'));
    const user = userEvent.setup();
    renderModal();
    const modal = await dialog();
    expect(await within(modal).findByText('No pudimos cargar la imputación del abono.')).toBeInTheDocument();
    expect(within(modal).queryByRole('button', { name: 'Guardar imputación' })).not.toBeInTheDocument();

    await user.click(within(modal).getByRole('button', { name: 'Reintentar' }));
    expect(await loaded()).toBeInTheDocument();
  });

  it('toast Imputación guardada. and refresh on success', async () => {
    let resolvePut!: (value: Awaited<ReturnType<typeof replacePaymentAllocations>>) => void;
    mockedPut.mockReturnValue(
      new Promise((resolve) => {
        resolvePut = resolve;
      }),
    );
    const user = userEvent.setup();
    const props = renderModal();
    await loaded();

    await user.click(screen.getByRole('button', { name: 'Guardar imputación' }));
    expect(await screen.findByRole('button', { name: /guardando/i })).toBeInTheDocument();

    resolvePut({ ...DATA, previous: [] });
    expect(await screen.findByText('Imputación guardada.')).toBeInTheDocument();
    expect(props.onSaved).toHaveBeenCalledTimes(1);
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });
});
