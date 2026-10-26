import { render, screen, waitFor, within } from '@testing-library/react';
import { ExpenseDetailModal } from './expense-detail-modal';
import { ApiError } from '@/lib/api/client';
import {
  addExpensePayment,
  attachExpenseReceipt,
  getExpense,
  getExpenseReceiptUrl,
  voidExpense,
  voidExpensePayment,
} from '@/lib/expenses/expenses-api';
import { uploadSingleFile } from '@/lib/files/upload-single-file';
import { startDownload } from '@/lib/patient-documents/download';
import { expenseDetailFixture, expenseLocations, expensePaymentFixture } from '@/lib/test/expenses';
import { setupUser } from '@/lib/test/user';
import type { ExpenseCategoriesState } from './use-expense-categories';

jest.mock('./use-expense-today', () => ({ useExpenseToday: () => ({ today: '2026-10-24', error: null, retry: jest.fn() }) }));
jest.mock('../../lib/expenses/expenses-api', () => ({
  ...jest.requireActual('../../lib/expenses/expenses-api'),
  getExpense: jest.fn(),
  voidExpense: jest.fn(),
  voidExpensePayment: jest.fn(),
  addExpensePayment: jest.fn(),
  attachExpenseReceipt: jest.fn(),
  getExpenseReceiptUrl: jest.fn(),
  requestExpenseReceiptUpload: jest.fn(),
  suggestExpenseSuppliers: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../lib/files/upload-single-file', () => ({
  ...jest.requireActual('../../lib/files/upload-single-file'),
  uploadSingleFile: jest.fn(),
}));
jest.mock('../../lib/patient-documents/download', () => ({ startDownload: jest.fn() }));
jest.mock('../../lib/hooks/use-media-query', () => ({ useMediaQuery: () => true }));
jest.mock('../../lib/reference/currencies-api', () => ({
  listCurrencies: jest.fn().mockResolvedValue([{ code: 'COP', name: 'Peso colombiano', symbol: '$' }]),
}));

const mockedGet = getExpense as jest.MockedFunction<typeof getExpense>;
const mockedVoid = voidExpense as jest.MockedFunction<typeof voidExpense>;
const mockedVoidPayment = voidExpensePayment as jest.MockedFunction<typeof voidExpensePayment>;
const mockedPay = addExpensePayment as jest.MockedFunction<typeof addExpensePayment>;
const mockedAttach = attachExpenseReceipt as jest.MockedFunction<typeof attachExpenseReceipt>;
const mockedUrl = getExpenseReceiptUrl as jest.MockedFunction<typeof getExpenseReceiptUrl>;
const mockedUpload = uploadSingleFile as jest.MockedFunction<typeof uploadSingleFile>;

const categories: ExpenseCategoriesState = {
  categories: [{ id: null, name: 'Laboratorio', predefined: true }],
  failed: false,
  reload: jest.fn(),
};

const cashPayment = expensePaymentFixture({ id: 'pay-1', cashSessionId: 'cs-1' });
const voidedPayment = expensePaymentFixture({
  id: 'pay-0',
  amount: 20_000,
  method: 'TRANSFER',
  paidOn: '2026-10-20',
  voidedAt: '2026-10-21T10:00:00.000Z',
  voidedByName: 'Admin Demo',
  voidReason: 'Transferencia rechazada',
});
const partial = expenseDetailFixture({ status: 'PARTIAL', paidAmount: 50_000, pendingAmount: 100_000 }, [
  cashPayment,
  voidedPayment,
]);

function renderDetail() {
  const onChanged = jest.fn();
  render(
    <ExpenseDetailModal
      open
      onOpenChange={jest.fn()}
      token="tok"
      expenseId="exp-1"
      locations={expenseLocations}
      categories={categories}
      onManageCategories={jest.fn()}
      onChanged={onChanged}
    />,
  );
  return { onChanged };
}

describe('ExpenseDetailModal (DX-274)', () => {
  beforeEach(() => {
    mockedGet.mockReset().mockResolvedValue(partial);
    mockedVoid.mockReset();
    mockedVoidPayment.mockReset();
    mockedPay.mockReset();
    mockedAttach.mockReset();
    mockedUrl.mockReset().mockResolvedValue({ url: 'https://files.example/r.pdf', expiresAt: '', disposition: 'inline' });
    mockedUpload.mockReset().mockResolvedValue('up-9');
    jest.mocked(startDownload).mockReset();
  });

  it('enseña los datos, el estado y los pagos con la caja de la salida', async () => {
    renderDetail();
    const dialog = await screen.findByRole('dialog', { name: 'Laboratorio · Lab Dental SAS' });
    expect(within(dialog).getByText('Parcial')).toBeInTheDocument();
    expect(within(dialog).getByText('Sede principal')).toBeInTheDocument();
    expect(within(dialog).getByText('Coronas de octubre')).toBeInTheDocument();
    const link = within(dialog).getByRole('link', { name: /Salida de caja/ });
    expect(link).toHaveAttribute('href', '/caja/turnos/cs-1');
    expect(within(dialog).getByText('Anulado por Admin Demo: Transferencia rechazada')).toBeInTheDocument();
    // Solo el pago vivo se puede anular.
    expect(within(dialog).getAllByRole('button', { name: /Anular el pago de/ })).toHaveLength(1);
    expect(within(dialog).getByLabelText('Adjuntar soporte')).toBeInTheDocument();
  });

  it('los datos son una lista de definiciones válida: cada par dt/dd en un div hijo directo del dl', async () => {
    renderDetail();
    const dialog = await screen.findByRole('dialog', { name: 'Laboratorio · Lab Dental SAS' });
    const list = dialog.querySelector('dl');
    expect(list).not.toBeNull();
    // axe (definition-list, dlitem): un <div> dentro de otro rompe la lista.
    for (const child of Array.from(list!.children)) {
      expect(child.tagName).toBe('DIV');
      expect(Array.from(child.children).map((c) => c.tagName)).toEqual(['DT', 'DD']);
    }
    expect(within(list as HTMLElement).getByText('Coronas de octubre').tagName).toBe('DD');
  });

  it('anular un pago exige motivo y actualiza el detalle', async () => {
    const user = setupUser();
    const voided = expenseDetailFixture({ status: 'PENDING', paidAmount: 0, pendingAmount: 150_000 }, [
      { ...cashPayment, voidedAt: '2026-10-24T10:00:00.000Z', voidReason: 'Error de caja', voidedByName: 'Admin Demo' },
    ]);
    mockedVoidPayment.mockResolvedValue(voided);
    const { onChanged } = renderDetail();
    await user.click(await screen.findByRole('button', { name: /Anular el pago de/ }));
    const modal = await screen.findByRole('dialog', { name: '¿Anular este pago?' });
    await user.type(within(modal).getByLabelText('Motivo de la anulación'), 'Mal');
    await user.click(within(modal).getByRole('button', { name: 'Anular pago' }));
    expect(await within(modal).findByText('Escribe el motivo (al menos 5 caracteres).')).toBeInTheDocument();
    await user.type(within(modal).getByLabelText('Motivo de la anulación'), ' registrado');
    await user.click(within(modal).getByRole('button', { name: 'Anular pago' }));
    await waitFor(() => expect(mockedVoidPayment).toHaveBeenCalledWith('tok', 'exp-1', 'pay-1', 'Mal registrado'));
    expect(onChanged).toHaveBeenCalledWith('Pago anulado.');
    expect(await screen.findByText('Anulado por Admin Demo: Error de caja')).toBeInTheDocument();
  });

  it('al cerrarse el modal, el foco vuelve al título del detalle si su botón ya no está', async () => {
    const user = setupUser();
    mockedVoidPayment.mockResolvedValue(
      expenseDetailFixture({ status: 'PENDING', paidAmount: 0, pendingAmount: 150_000 }, [
        { ...cashPayment, voidedAt: '2026-10-24T10:00:00.000Z', voidReason: 'Error de caja' },
      ]),
    );
    renderDetail();
    await user.click(await screen.findByRole('button', { name: /Anular el pago de/ }));
    const modal = await screen.findByRole('dialog', { name: '¿Anular este pago?' });
    await user.type(within(modal).getByLabelText('Motivo de la anulación'), 'Error de caja');
    await user.click(within(modal).getByRole('button', { name: 'Anular pago' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '¿Anular este pago?' })).not.toBeInTheDocument());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Laboratorio · Lab Dental SAS' })),
    );
  });

  it('si el botón sigue ahí (Cancelar), el foco vuelve a él', async () => {
    const user = setupUser();
    renderDetail();
    const edit = await screen.findByRole('button', { name: 'Editar' });
    await user.click(edit);
    const modal = await screen.findByRole('dialog', { name: 'Editar gasto' });
    await user.click(within(modal).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(document.activeElement).toBe(edit));
  });

  it('anular el gasto lo deja sin acciones y el foco en el título', async () => {
    const user = setupUser();
    mockedVoid.mockResolvedValue(
      expenseDetailFixture({
        status: 'VOIDED',
        voidedAt: '2026-10-24T10:00:00.000Z',
        voidedByName: 'Admin Demo',
        voidReason: 'Factura duplicada',
      }),
    );
    const { onChanged } = renderDetail();
    await user.click(await screen.findByRole('button', { name: 'Anular gasto' }));
    const modal = await screen.findByRole('dialog', { name: '¿Anular este gasto?' });
    expect(within(modal).getByText(/en la próxima caja de la sede/)).toBeInTheDocument();
    await user.type(within(modal).getByLabelText('Motivo de la anulación'), 'Factura duplicada');
    await user.click(within(modal).getByRole('button', { name: 'Anular gasto' }));
    await waitFor(() => expect(mockedVoid).toHaveBeenCalledWith('tok', 'exp-1', 'Factura duplicada'));
    expect(onChanged).toHaveBeenCalledWith('Gasto anulado.');
    expect(await screen.findByText('Anulado por Admin Demo: Factura duplicada')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Laboratorio · Lab Dental SAS' })),
    );
  });

  it('un rechazo de la anulación se dice dentro del modal', async () => {
    const user = setupUser();
    mockedVoid.mockRejectedValue(new ApiError(409, 'El gasto ya está anulado.'));
    renderDetail();
    await user.click(await screen.findByRole('button', { name: 'Anular gasto' }));
    const modal = await screen.findByRole('dialog', { name: '¿Anular este gasto?' });
    await user.type(within(modal).getByLabelText('Motivo de la anulación'), 'Factura duplicada');
    await user.click(within(modal).getByRole('button', { name: 'Anular gasto' }));
    expect(await within(modal).findByText('El gasto ya está anulado.')).toBeInTheDocument();
  });

  it('«Registrar pago» propone lo pendiente y lo registra desde la caja', async () => {
    const user = setupUser();
    mockedPay.mockResolvedValue(expenseDetailFixture({ status: 'PAID', paidAmount: 150_000, pendingAmount: 0 }));
    const { onChanged } = renderDetail();
    await user.click(await screen.findByRole('button', { name: 'Registrar pago' }));
    const modal = await screen.findByRole('dialog', { name: 'Registrar pago' });
    expect(within(modal).getByLabelText('Importe (COP)')).toHaveValue('100000');
    await user.click(within(modal).getByRole('checkbox', { name: 'Desde mi caja abierta' }));
    await user.click(within(modal).getByRole('button', { name: 'Registrar pago' }));
    await waitFor(() => expect(mockedPay).toHaveBeenCalled());
    expect(mockedPay.mock.calls[0][2]).toEqual({ amount: 100000, method: 'CASH', fromCashSession: true });
    expect(onChanged).toHaveBeenCalledWith(expect.stringMatching(/^Pago de .* registrado\.$/));
    // Pagado del todo: ya no se ofrece otro pago.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Registrar pago' })).not.toBeInTheDocument());
  });

  it('«Registrar pago» desde la caja sin caja abierta: el 409 de la API se dice en el modal', async () => {
    const user = setupUser();
    mockedPay.mockRejectedValue(new ApiError(409, 'Abre tu caja en esta sede para pagar desde el cajón.'));
    renderDetail();
    await user.click(await screen.findByRole('button', { name: 'Registrar pago' }));
    const modal = await screen.findByRole('dialog', { name: 'Registrar pago' });
    await user.click(within(modal).getByRole('checkbox', { name: 'Desde mi caja abierta' }));
    await user.click(within(modal).getByRole('button', { name: 'Registrar pago' }));
    expect(await within(modal).findByText('Abre tu caja en esta sede para pagar desde el cajón.')).toBeInTheDocument();
  });

  it('el pago no puede pasar de lo pendiente', async () => {
    const user = setupUser();
    renderDetail();
    await user.click(await screen.findByRole('button', { name: 'Registrar pago' }));
    const modal = await screen.findByRole('dialog', { name: 'Registrar pago' });
    await user.clear(within(modal).getByLabelText('Importe (COP)'));
    await user.type(within(modal).getByLabelText('Importe (COP)'), '200000');
    await user.click(within(modal).getByRole('button', { name: 'Registrar pago' }));
    expect(await within(modal).findByText(/El pago supera lo pendiente del gasto/)).toBeInTheDocument();
    expect(mockedPay).not.toHaveBeenCalled();
  });

  it('sin soporte: se sube y se guarda en el gasto', async () => {
    const user = setupUser();
    mockedAttach.mockResolvedValue({
      ...partial,
      attachment: { name: 'luz.pdf', mimeType: 'application/pdf', sizeBytes: 2048, sha256: 'ab' },
    });
    renderDetail();
    await user.upload(
      await screen.findByLabelText('Adjuntar soporte'),
      new File(['%PDF-'], 'luz.pdf', { type: 'application/pdf' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Guardar soporte' }));
    await waitFor(() => expect(mockedAttach).toHaveBeenCalledWith('tok', 'exp-1', 'up-9'));
    expect(await screen.findByRole('button', { name: 'Ver' })).toBeInTheDocument();
  });

  it('con soporte: «Ver» abre el visor y «Descargar» pide la URL de descarga', async () => {
    const user = setupUser();
    mockedGet.mockResolvedValue({
      ...partial,
      attachment: { name: 'luz.pdf', mimeType: 'application/pdf', sizeBytes: 2048, sha256: 'ab' },
    });
    renderDetail();
    await user.click(await screen.findByRole('button', { name: 'Ver' }));
    expect(await screen.findByTitle('Vista previa de luz.pdf')).toHaveAttribute('src', 'https://files.example/r.pdf');
    expect(mockedUrl).toHaveBeenCalledWith('tok', 'exp-1', 'inline');
    await user.keyboard('{Escape}');
    await user.click(await screen.findByRole('button', { name: 'Descargar' }));
    await waitFor(() => expect(startDownload).toHaveBeenCalledWith('https://files.example/r.pdf'));
    expect(mockedUrl).toHaveBeenLastCalledWith('tok', 'exp-1', 'attachment');
  });

  it('un gasto de una sede inactiva sigue diciendo de cuál es', async () => {
    mockedGet.mockResolvedValue(expenseDetailFixture({ locationId: 'loc-3' }));
    render(
      <ExpenseDetailModal
        open
        onOpenChange={jest.fn()}
        token="tok"
        expenseId="exp-1"
        locations={[
          ...expenseLocations,
          { ...expenseLocations[1], id: 'loc-3', name: 'Sede cerrada', isActive: false },
        ]}
        categories={categories}
        onManageCategories={jest.fn()}
        onChanged={jest.fn()}
      />,
    );
    expect(await screen.findByText('Sede cerrada')).toBeInTheDocument();
  });

  it('un gasto anulado no ofrece acciones', async () => {
    mockedGet.mockResolvedValue(
      expenseDetailFixture({
        status: 'VOIDED',
        voidedAt: '2026-10-22T10:00:00.000Z',
        voidedByName: 'Admin Demo',
        voidReason: 'Factura duplicada',
      }),
    );
    renderDetail();
    expect(await screen.findByText('Anulado por Admin Demo: Factura duplicada')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Anular gasto' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Adjuntar soporte')).not.toBeInTheDocument();
  });

  it('si no carga: escalón 1 con Reintentar', async () => {
    const user = setupUser();
    mockedGet.mockRejectedValueOnce(new ApiError(500, 'boom'));
    renderDetail();
    expect(await screen.findByText('No pudimos cargar el gasto.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('dialog', { name: 'Laboratorio · Lab Dental SAS' })).toBeInTheDocument();
  });
});
