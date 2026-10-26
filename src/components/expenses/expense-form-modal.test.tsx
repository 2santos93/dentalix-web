import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExpenseFormModal } from './expense-form-modal';
import { ApiError } from '@/lib/api/client';
import { createExpense, suggestExpenseSuppliers, updateExpense } from '@/lib/expenses/expenses-api';
import { uploadSingleFile } from '@/lib/files/upload-single-file';
import { expenseDetailFixture, expenseLocations, expensePaymentFixture } from '@/lib/test/expenses';
import { setupUser } from '@/lib/test/user';
import type { ExpenseCategoriesState } from './use-expense-categories';

const mockExpenseToday: { today: string | null; error: string | null; retry: jest.Mock } = { today: '2026-10-24', error: null, retry: jest.fn() };
jest.mock('./use-expense-today', () => ({ useExpenseToday: () => mockExpenseToday }));
jest.mock('../../lib/expenses/expenses-api', () => ({
  ...jest.requireActual('../../lib/expenses/expenses-api'),
  createExpense: jest.fn(),
  updateExpense: jest.fn(),
  suggestExpenseSuppliers: jest.fn(),
  requestExpenseReceiptUpload: jest.fn(),
}));
jest.mock('../../lib/files/upload-single-file', () => ({
  ...jest.requireActual('../../lib/files/upload-single-file'),
  uploadSingleFile: jest.fn(),
}));
jest.mock('../../lib/reference/currencies-api', () => ({
  listCurrencies: jest.fn().mockResolvedValue([
    { code: 'COP', name: 'Peso colombiano', symbol: '$' },
    { code: 'USD', name: 'Dólar estadounidense', symbol: 'US$' },
  ]),
}));

const mockedCreate = createExpense as jest.MockedFunction<typeof createExpense>;
const mockedUpdate = updateExpense as jest.MockedFunction<typeof updateExpense>;
const mockedSuppliers = suggestExpenseSuppliers as jest.MockedFunction<typeof suggestExpenseSuppliers>;
const mockedUpload = uploadSingleFile as jest.MockedFunction<typeof uploadSingleFile>;

const categories: ExpenseCategoriesState = {
  categories: [
    { id: null, name: 'Laboratorio', predefined: true },
    { id: null, name: 'Mensajería', predefined: true },
    { id: 'cat-1', name: 'Seguros', predefined: false },
  ],
  failed: false,
  reload: jest.fn(),
};

function renderModal(props: Partial<React.ComponentProps<typeof ExpenseFormModal>> = {}) {
  const onSaved = jest.fn();
  const onOpenChange = jest.fn();
  const onManageCategories = jest.fn();
  render(
    <ExpenseFormModal
      open
      onOpenChange={onOpenChange}
      token="tok"
      locations={expenseLocations}
      defaultLocationId={null}
      categories={categories}
      onManageCategories={onManageCategories}
      onSaved={onSaved}
      {...props}
    />,
  );
  return { onSaved, onOpenChange, onManageCategories };
}

async function fillRequired(user: ReturnType<typeof setupUser>) {
  await screen.findByRole('option', { name: 'Peso colombiano ($)' });
  await user.selectOptions(screen.getByLabelText('Moneda'), 'COP');
  await user.selectOptions(screen.getByLabelText('Categoría'), 'Laboratorio');
  await user.type(screen.getByLabelText('Importe'), '150.000');
}

describe('ExpenseFormModal (DX-274)', () => {
  beforeEach(() => {
    Object.assign(mockExpenseToday, { today: '2026-10-24', error: null });
    mockExpenseToday.retry.mockReset();
    mockedCreate.mockReset().mockResolvedValue(expenseDetailFixture());
    mockedUpdate.mockReset().mockResolvedValue(expenseDetailFixture());
    mockedSuppliers.mockReset().mockResolvedValue(['Lab Dental SAS', 'Mensajeros Ya']);
    mockedUpload.mockReset().mockResolvedValue('up-1');
  });

  it('sin zona configurada no propone fecha ni permite guardar y ofrece reintentar', async () => {
    const user = setupUser();
    Object.assign(mockExpenseToday, { today: null, error: 'Configura la zona horaria de esta sede.' });
    renderModal();
    expect(screen.getByLabelText('Fecha de factura')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Registrar gasto' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(mockExpenseToday.retry).toHaveBeenCalledTimes(1);
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('sin moneda explícita no presupone una por país ni permite enviar el gasto', async () => {
    const user = setupUser();
    renderModal();
    await waitFor(() => expect(screen.getByLabelText('Moneda')).toHaveValue(''));
    await user.selectOptions(screen.getByLabelText('Categoría'), 'Laboratorio');
    await user.type(screen.getByLabelText('Importe'), '100');
    await user.click(screen.getByRole('button', { name: 'Registrar gasto' }));
    expect(await screen.findByText('Elige la moneda del gasto.')).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('alta: sede y fecha configuradas, moneda elegida explícitamente; manda solo lo escrito', async () => {
    const user = setupUser();
    const { onSaved, onOpenChange } = renderModal();
    expect(screen.getByLabelText('Sede')).toHaveValue('loc-1');
    expect(screen.getByLabelText('Fecha de factura')).toHaveValue('2026-10-24');
    expect(screen.getByLabelText('Fecha de factura')).toHaveAttribute('max', '2026-10-24');
    await fillRequired(user);
    await user.type(screen.getByLabelText('Proveedor'), '  Lab   Dental SAS ');
    await user.click(screen.getByRole('button', { name: 'Registrar gasto' }));
    await waitFor(() => expect(mockedCreate).toHaveBeenCalled());
    const [, body, key] = mockedCreate.mock.calls[0];
    expect(body).toEqual({
      locationId: 'loc-1',
      category: 'Laboratorio',
      supplier: 'Lab Dental SAS',
      amount: 150000,
      currency: 'COP',
      invoiceDate: '2026-10-24',
    });
    expect(key).toEqual(expect.any(String));
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'exp-1' }), 'Gasto registrado.');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('sugiere proveedores ya usados en un datalist', async () => {
    renderModal();
    await waitFor(() => expect(mockedSuppliers).toHaveBeenCalledWith('tok', ''));
    const input = screen.getByLabelText('Proveedor');
    const list = document.getElementById(input.getAttribute('list') ?? '');
    await waitFor(() => expect(list?.querySelectorAll('option')).toHaveLength(2));
  });

  it('valida junto a cada campo antes de enviar', async () => {
    const user = setupUser();
    renderModal();
    await user.click(screen.getByRole('button', { name: 'Registrar gasto' }));
    expect(await screen.findByText('Elige una categoría.')).toBeInTheDocument();
    expect(screen.getByText('Escribe un importe mayor que 0.')).toBeInTheDocument();
    expect(screen.getByLabelText('Importe')).toHaveAttribute('aria-invalid', 'true');
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('«Ya está pagado» desde mi caja abierta: efectivo de hoy por el importe completo', async () => {
    const user = setupUser();
    renderModal();
    await fillRequired(user);
    await user.click(screen.getByRole('checkbox', { name: 'Ya está pagado' }));
    expect(screen.getByLabelText('Medio de pago')).toHaveValue('CASH');
    await user.click(screen.getByRole('checkbox', { name: 'Desde mi caja abierta' }));
    expect(screen.getByLabelText('Fecha del pago')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Registrar gasto' }));
    await waitFor(() => expect(mockedCreate).toHaveBeenCalled());
    expect(mockedCreate.mock.calls[0][1].payment).toEqual({ amount: 150000, method: 'CASH', fromCashSession: true });
  });

  it('«Desde mi caja abierta» solo con efectivo; con transferencia manda la fecha', async () => {
    const user = setupUser();
    renderModal();
    await fillRequired(user);
    await user.click(screen.getByRole('checkbox', { name: 'Ya está pagado' }));
    await user.selectOptions(screen.getByLabelText('Medio de pago'), 'TRANSFER');
    expect(screen.queryByRole('checkbox', { name: 'Desde mi caja abierta' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Registrar gasto' }));
    await waitFor(() => expect(mockedCreate).toHaveBeenCalled());
    expect(mockedCreate.mock.calls[0][1].payment).toEqual({
      amount: 150000,
      method: 'TRANSFER',
      paidOn: '2026-10-24',
      fromCashSession: false,
    });
  });

  it('el soporte se sube al elegirlo y viaja su uploadId', async () => {
    const user = setupUser();
    renderModal();
    await fillRequired(user);
    await user.upload(screen.getByLabelText('Soporte'), new File(['%PDF-'], 'luz.pdf', { type: 'application/pdf' }));
    expect(await screen.findByText('Subido')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Registrar gasto' }));
    await waitFor(() => expect(mockedCreate).toHaveBeenCalled());
    expect(mockedCreate.mock.calls[0][1].attachmentUploadId).toBe('up-1');
  });

  it('si la subida falla no se guarda sin avisar: reintentar o quitar', async () => {
    const user = setupUser();
    mockedUpload.mockRejectedValueOnce(new ApiError(503, 'El almacén de archivos no responde. Inténtalo de nuevo en unos minutos.'));
    renderModal();
    await fillRequired(user);
    await user.upload(screen.getByLabelText('Soporte'), new File(['%PDF-'], 'luz.pdf', { type: 'application/pdf' }));
    expect(await screen.findByText(/El almacén de archivos no responde/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Registrar gasto' }));
    expect(
      await screen.findByText('El soporte no se subió: reintenta la subida o quítalo antes de guardar.'),
    ).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Subido')).toBeInTheDocument();
  });

  it('tras fallar el soporte permite quitarlo y guardar sin adjunto conservando datos y clave de reintento', async () => {
    const user = setupUser();
    mockedUpload.mockRejectedValueOnce(new ApiError(503, 'El almacén no responde.'));
    mockedCreate.mockRejectedValueOnce(new ApiError(409, 'Confirma que la caja sigue abierta.'));
    renderModal();
    await fillRequired(user);
    await user.type(screen.getByLabelText('Proveedor'), 'Proveedor conservado');
    await user.upload(screen.getByLabelText('Soporte'), new File(['%PDF-'], 'luz.pdf', { type: 'application/pdf' }));
    await screen.findByText(/El almacén de archivos no responde/);
    await user.click(screen.getByRole('button', { name: 'Registrar gasto' }));
    expect(mockedCreate).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Quitar el archivo' }));
    expect(screen.queryByText('luz.pdf')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Registrar gasto' }));
    await screen.findByText('Confirma que la caja sigue abierta.');
    expect(mockedCreate.mock.calls[0][1]).toEqual(expect.objectContaining({ amount: 150000, supplier: 'Proveedor conservado' }));
    expect(mockedCreate.mock.calls[0][1]).not.toHaveProperty('attachmentUploadId');
    await user.click(screen.getByRole('button', { name: 'Registrar gasto' }));
    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(2));
    expect(mockedCreate.mock.calls[1]).toEqual(mockedCreate.mock.calls[0]);
  });

  it('un tipo no admitido se dice junto al campo, sin pedir nada a la API', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0, applyAccept: false });
    renderModal();
    await user.upload(screen.getByLabelText('Soporte'), new File(['x'], 'contrato.docx', { type: 'application/msword' }));
    expect(
      await screen.findByText('Tipo de archivo no admitido. Sube un PDF, JPG, PNG o una foto HEIC.'),
    ).toBeInTheDocument();
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it('un rechazo de la API sale arriba y el reintento reusa la clave', async () => {
    const user = setupUser();
    mockedCreate.mockRejectedValueOnce(new ApiError(409, 'Abre tu caja en esta sede para pagar desde el cajón.'));
    renderModal();
    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Registrar gasto' }));
    expect(await screen.findByText('Abre tu caja en esta sede para pagar desde el cajón.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Registrar gasto' }));
    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(2));
    expect(mockedCreate.mock.calls[1][2]).toBe(mockedCreate.mock.calls[0][2]);
  });

  it('«Gestionar categorías» abre su modal', async () => {
    const user = setupUser();
    const { onManageCategories } = renderModal();
    await user.click(screen.getByRole('button', { name: 'Gestionar categorías' }));
    expect(onManageCategories).toHaveBeenCalled();
  });

  it('sin categorías, el campo falla en su sitio con reintento', async () => {
    const user = setupUser();
    const reload = jest.fn();
    renderModal({ categories: { categories: null, failed: true, reload } });
    expect(screen.getByText('Categorías no disponibles')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(reload).toHaveBeenCalled();
  });

  it('edición con pagos: sede y moneda fijas y solo se manda lo que cambió del importe', async () => {
    const user = setupUser();
    const expense = expenseDetailFixture(
      { category: 'Categoría retirada', paidAmount: 50_000, pendingAmount: 100_000, status: 'PARTIAL' },
      [expensePaymentFixture()],
    );
    const { onSaved } = renderModal({ expense });
    expect(screen.getByRole('dialog', { name: 'Editar gasto' })).toBeInTheDocument();
    expect(screen.getByLabelText('Sede')).toBeDisabled();
    expect(screen.getByLabelText('Moneda')).toBeDisabled();
    expect(screen.getByLabelText('Categoría')).toHaveValue('Categoría retirada');
    expect(screen.queryByLabelText('Soporte')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Importe')).toHaveValue('150000');

    await user.clear(screen.getByLabelText('Importe'));
    await user.type(screen.getByLabelText('Importe'), '40000');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText(/No puede ser menor que lo ya pagado/)).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Importe'));
    await user.type(screen.getByLabelText('Importe'), '150000');
    await user.clear(screen.getByLabelText('Proveedor'));
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalled());
    expect(mockedUpdate.mock.calls[0][1]).toBe('exp-1');
    expect(mockedUpdate.mock.calls[0][2]).toEqual({
      category: 'Categoría retirada',
      supplier: null,
      description: 'Coronas de octubre',
      invoiceDate: '2026-10-20',
      dueDate: null,
    });
    expect(onSaved).toHaveBeenCalledWith(expect.anything(), 'Gasto actualizado.');
  });

  it('si las sedes llegan después de abrir, propone la sede sin borrar lo escrito', async () => {
    const user = setupUser();
    const props = {
      open: true,
      onOpenChange: jest.fn(),
      token: 'tok',
      defaultLocationId: 'loc-2',
      categories,
      onManageCategories: jest.fn(),
      onSaved: jest.fn(),
    };
    const { rerender } = render(<ExpenseFormModal {...props} locations={[]} />);
    await user.type(screen.getByLabelText('Importe'), '8000');
    rerender(<ExpenseFormModal {...props} locations={expenseLocations} />);
    expect(screen.getByLabelText('Sede')).toHaveValue('loc-2');
    expect(screen.getByLabelText('Importe')).toHaveValue('8000');
  });
});
