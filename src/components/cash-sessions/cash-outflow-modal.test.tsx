import { render, screen, waitFor } from '@testing-library/react';
import { CashOutflowModal } from './cash-outflow-modal';
import { ApiError } from '@/lib/api/client';
import { createCashOutflow, suggestExpenseSuppliers } from '@/lib/expenses/expenses-api';
import { listExpenseCategories } from '@/lib/expenses/expense-categories-api';
import { uploadSingleFile } from '@/lib/files/upload-single-file';
import { expenseDetailFixture } from '@/lib/test/expenses';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/expenses/expenses-api', () => ({
  ...jest.requireActual('../../lib/expenses/expenses-api'),
  createCashOutflow: jest.fn(),
  suggestExpenseSuppliers: jest.fn(),
  requestExpenseReceiptUpload: jest.fn(),
}));
jest.mock('../../lib/expenses/expense-categories-api', () => ({ listExpenseCategories: jest.fn() }));
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

const mockedCreate = createCashOutflow as jest.MockedFunction<typeof createCashOutflow>;
const mockedSuppliers = suggestExpenseSuppliers as jest.MockedFunction<typeof suggestExpenseSuppliers>;
const mockedCategories = listExpenseCategories as jest.MockedFunction<typeof listExpenseCategories>;
const mockedUpload = uploadSingleFile as jest.MockedFunction<typeof uploadSingleFile>;

function renderModal() {
  const onCreated = jest.fn();
  const onOpenChange = jest.fn();
  render(
    <CashOutflowModal
      open
      onOpenChange={onOpenChange}
      token="tok"
      locationId="loc-2"
      sedeName="Sede norte"
      defaultCurrency="COP"
      onCreated={onCreated}
    />,
  );
  return { onCreated, onOpenChange };
}

async function fillRequired(user: ReturnType<typeof setupUser>) {
  await screen.findByRole('option', { name: 'Mensajería' });
  await user.selectOptions(screen.getByLabelText('Categoría'), 'Mensajería');
  await user.type(screen.getByLabelText('Importe'), '8.000');
}

describe('CashOutflowModal (DX-274)', () => {
  beforeEach(() => {
    mockedCreate.mockReset().mockResolvedValue(expenseDetailFixture());
    mockedSuppliers.mockReset().mockResolvedValue(['Mensajeros Ya']);
    mockedCategories.mockReset().mockResolvedValue([
      { id: null, name: 'Mensajería', predefined: true },
      { id: 'cat-1', name: 'Café', predefined: false },
    ]);
    mockedUpload.mockReset().mockResolvedValue('up-1');
  });

  it('registra la salida desde la caja de su sede (X-Location-Id) con lo escrito, recortado', async () => {
    const user = setupUser();
    const { onCreated, onOpenChange } = renderModal();
    expect(screen.getByRole('dialog', { name: 'Salida de caja' })).toHaveTextContent('Sede norte');
    await fillRequired(user);
    await user.type(screen.getByLabelText('Proveedor'), '  Mensajeros   Ya ');
    await user.type(screen.getByLabelText('Descripción'), '  Envío de muestras ');
    await user.click(screen.getByRole('button', { name: 'Registrar salida' }));

    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(1));
    const [token, body, key, locationId] = mockedCreate.mock.calls[0];
    expect(token).toBe('tok');
    expect(body).toEqual({
      category: 'Mensajería',
      supplier: 'Mensajeros Ya',
      description: 'Envío de muestras',
      amount: 8_000,
      currency: 'COP',
    });
    expect(key).toEqual(expect.any(String));
    expect(locationId).toBe('loc-2');
    expect(onCreated).toHaveBeenCalledWith(expect.anything(), expect.stringMatching(/^Salida de caja de 8\.?000,00\sCOP registrada\.$/));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('sin categoría ni importe no sale nada hacia la API', async () => {
    const user = setupUser();
    renderModal();
    await screen.findByRole('option', { name: 'Mensajería' });
    await user.click(screen.getByRole('button', { name: 'Registrar salida' }));
    expect(screen.getByText('Elige una categoría.')).toBeInTheDocument();
    expect(screen.getByText('Escribe un importe mayor que 0.')).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('el soporte se sube al elegirlo y viaja su uploadId', async () => {
    const user = setupUser();
    renderModal();
    await fillRequired(user);
    await user.upload(screen.getByLabelText('Soporte'), new File(['%PDF-'], 'recibo.pdf', { type: 'application/pdf' }));
    expect(await screen.findByText('Subido')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Registrar salida' }));
    await waitFor(() => expect(mockedCreate).toHaveBeenCalled());
    expect(mockedCreate.mock.calls[0][1].attachmentUploadId).toBe('up-1');
  });

  it('tras fallar el soporte puede quitarlo y guardar sin adjunto manteniendo datos, sede y clave', async () => {
    const user = setupUser();
    mockedUpload.mockRejectedValueOnce(new ApiError(503, 'El almacén no responde.'));
    mockedCreate.mockRejectedValueOnce(new ApiError(409, 'Confirma que la caja sigue abierta.'));
    renderModal();
    await fillRequired(user);
    await user.type(screen.getByLabelText('Proveedor'), 'Proveedor conservado');
    await user.upload(screen.getByLabelText('Soporte'), new File(['%PDF-'], 'recibo.pdf', { type: 'application/pdf' }));
    await screen.findByText(/El almacén de archivos no responde/);
    await user.click(screen.getByRole('button', { name: 'Registrar salida' }));
    expect(mockedCreate).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Quitar el archivo' }));
    await user.click(screen.getByRole('button', { name: 'Registrar salida' }));
    await screen.findByText('Confirma que la caja sigue abierta.');
    expect(mockedCreate.mock.calls[0][1]).toEqual(expect.objectContaining({ amount: 8000, supplier: 'Proveedor conservado' }));
    expect(mockedCreate.mock.calls[0][1]).not.toHaveProperty('attachmentUploadId');
    expect(mockedCreate.mock.calls[0][3]).toBe('loc-2');
    await user.click(screen.getByRole('button', { name: 'Registrar salida' }));
    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(2));
    expect(mockedCreate.mock.calls[1]).toEqual(mockedCreate.mock.calls[0]);
  });

  it('el 409 sin caja abierta sale con el texto de la API y el reintento reusa la clave', async () => {
    const user = setupUser();
    mockedCreate.mockRejectedValueOnce(
      new ApiError(409, 'Abre tu caja en esta sede para registrar una salida de caja.'),
    );
    const { onCreated } = renderModal();
    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Registrar salida' }));
    expect(await screen.findByText('Abre tu caja en esta sede para registrar una salida de caja.')).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Registrar salida' }));
    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(2));
    expect(mockedCreate.mock.calls[1][2]).toBe(mockedCreate.mock.calls[0][2]);
  });

  it('si las categorías no cargan, el campo lo dice y deja reintentar', async () => {
    const user = setupUser();
    mockedCategories.mockRejectedValueOnce(new ApiError(500, 'boom'));
    renderModal();
    expect(await screen.findByText('Categorías no disponibles')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('option', { name: 'Mensajería' })).toBeInTheDocument();
  });
});
