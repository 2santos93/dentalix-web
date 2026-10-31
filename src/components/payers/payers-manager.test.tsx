import { render, screen, waitFor, within } from '@testing-library/react';
import { PayersManager } from './payers-manager';
import { createPayer, deletePayer, listPayers, updatePayer, type Payer } from '@/lib/payers/payers-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';
import { notifyError } from '../errors/notify';

jest.mock('../../lib/payers/payers-api', () => ({
  ...jest.requireActual('../../lib/payers/payers-api'),
  listPayers: jest.fn(),
  createPayer: jest.fn(),
  updatePayer: jest.fn(),
  deletePayer: jest.fn(),
}));
jest.mock('../errors/notify', () => ({ notifyError: jest.fn() }));

const mockedList = listPayers as jest.MockedFunction<typeof listPayers>;
const mockedCreate = createPayer as jest.MockedFunction<typeof createPayer>;
const mockedUpdate = updatePayer as jest.MockedFunction<typeof updatePayer>;
const mockedDelete = deletePayer as jest.MockedFunction<typeof deletePayer>;
const mockedNotify = notifyError as jest.MockedFunction<typeof notifyError>;

const sanitas: Payer = {
  id: 'payer-1',
  name: 'Sanitas',
  type: 'PUBLIC_SYSTEM',
  active: true,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};
const adeslas: Payer = { ...sanitas, id: 'payer-2', name: 'Adeslas', type: 'INSURER' };
const acme: Payer = { ...sanitas, id: 'payer-3', name: 'Acme', type: 'EMPLOYER', active: false };

/** Teléfono: `DataList` pinta tarjetas cuando `matchMedia` dice que sí. */
function mockPhone() {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  restorePhone = () => {
    window.matchMedia = original;
    restorePhone = null;
  };
}
let restorePhone: (() => void) | null = null;
afterEach(() => restorePhone?.());

/** Abre el «⋯» de la fila y elige la acción. */
async function rowAction(user: ReturnType<typeof setupUser>, row: string, action: string) {
  await user.click(screen.getByRole('button', { name: `Acciones de ${row}` }));
  await user.click(await screen.findByRole('menuitem', { name: action }));
}

describe('PayersManager (DX-153)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedList.mockResolvedValue([sanitas, adeslas, acme]);
  });

  it('solo ADMIN: otro rol ve el aviso y no se pide nada', () => {
    render(<PayersManager token="tok" allowed={false} />);
    expect(screen.getByText('Solo administración gestiona los pagadores.')).toBeInTheDocument();
    expect(mockedList).not.toHaveBeenCalled();
  });

  it('lista pagadores activos e inactivos con tipo y estado, sin columna de país', async () => {
    render(<PayersManager token="tok" allowed />);
    const table = await screen.findByRole('table', { name: 'Pagadores' });
    const rows = within(table).getAllByRole('row');
    expect(
      within(rows[0])
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Nombre', 'Tipo', 'Acciones']);
    const cells = (row: HTMLElement) =>
      within(row)
        .getAllByRole('cell')
        .slice(0, 2)
        .map((c) => c.textContent);
    // El estado solo se ve cuando es la excepción (inactivo).
    expect(cells(rows[1])).toEqual(['Sanitas', 'Sistema público de salud']);
    expect(cells(rows[2])).toEqual(['Adeslas', 'Aseguradora']);
    expect(cells(rows[3])).toEqual(['AcmeInactivo', 'Empresa']);
    expect(within(table).queryByText('Activo')).toBeNull();
    expect(within(table).queryByText('País')).toBeNull();
    expect(screen.getByText('3 pagadores')).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledWith('tok', { includeInactive: true });
  });

  it('la tarjeta móvil solo muestra la etiqueta del tipo', async () => {
    mockPhone();
    render(<PayersManager token="tok" allowed />);
    const list = await screen.findByRole('list', { name: 'Pagadores' });
    const cards = within(list).getAllByRole('listitem');
    expect(within(cards[0]).getByText('Sistema público de salud')).toBeInTheDocument();
    expect(within(cards[1]).getByText('Aseguradora')).toBeInTheDocument();
    expect(within(cards[2]).getByText('Empresa')).toBeInTheDocument();
    expect(within(list).queryByText(/·/)).toBeNull();
    // Toda la tarjeta abre la edición; el resto de acciones, en su «⋯».
    expect(within(cards[0]).getByRole('button', { name: /^Sanitas/ })).toBeInTheDocument();
    expect(within(cards[0]).getByRole('button', { name: 'Acciones de Sanitas' })).toBeInTheDocument();
  });

  // Excepción G5.3 (DX-334): tipo de pagador anterior a DX-326.
  it('legacy: una fila con un código de una API anterior muestra la etiqueta genérica', async () => {
    mockedList.mockResolvedValue([{ ...sanitas, type: 'EPS_CO' as never }]);
    mockPhone();
    render(<PayersManager token="tok" allowed />);
    const list = await screen.findByRole('list', { name: 'Pagadores' });
    expect(within(within(list).getAllByRole('listitem')[0]).getByText('Sistema público de salud')).toBeInTheDocument();
    expect(screen.queryByText('EPS_CO')).toBeNull();
  });

  it('vacío: dice que aún no hay pagadores y cuáles crear', async () => {
    mockedList.mockResolvedValue([]);
    render(<PayersManager token="tok" allowed />);
    expect(await screen.findByText('Todavía no hay pagadores.')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Crea las aseguradoras, planes prepago, sistemas públicos o empresas con las que trabajas para registrar la cobertura de tus pacientes.',
      ),
    ).toBeInTheDocument();
    // Vacía: sin «0 pagadores»; la acción vive dentro del estado vacío.
    expect(screen.queryByText('0 pagadores')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Nuevo pagador' })).toHaveLength(1);
  });

  it('error de carga con reintento', async () => {
    const user = setupUser();
    mockedList.mockRejectedValueOnce(new ApiError(500, 'Caído'));
    render(<PayersManager token="tok" allowed />);
    const alert = await screen.findByRole('alert');
    await user.click(within(alert).getByRole('button', { name: /reintentar/i }));
    expect(await screen.findByRole('table', { name: 'Pagadores' })).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledTimes(2);
  });

  it('crea un pagador sin país y lo añade ordenado', async () => {
    const user = setupUser();
    mockedCreate.mockResolvedValue({ ...sanitas, id: 'payer-4', name: 'Bupa', type: 'INSURER' });
    render(<PayersManager token="tok" allowed />);
    await screen.findByRole('table', { name: 'Pagadores' });

    await user.click(screen.getByRole('button', { name: 'Nuevo pagador' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByLabelText('País')).toBeNull();
    await user.type(within(dialog).getByLabelText('Nombre'), 'Bupa');
    await user.selectOptions(within(dialog).getByLabelText('Tipo'), 'INSURER');
    await user.click(within(dialog).getByRole('button', { name: 'Crear pagador' }));
    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith('tok', { name: 'Bupa', type: 'INSURER' }),
    );
    const table = await screen.findByRole('table', { name: 'Pagadores' });
    const names = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((r) => within(r).getAllByRole('cell')[0].textContent);
    expect(names).toEqual(['AcmeInactivo', 'Adeslas', 'Bupa', 'Sanitas']);
  });

  it('edita un pagador existente', async () => {
    const user = setupUser();
    mockedUpdate.mockResolvedValue({ ...sanitas, name: 'Sanitas Colombia' });
    render(<PayersManager token="tok" allowed />);
    const table = await screen.findByRole('table', { name: 'Pagadores' });
    // La fila abre la edición.
    await user.click(within(table).getByRole('button', { name: 'Sanitas' }));
    const dialog = await screen.findByRole('dialog');
    const name = within(dialog).getByLabelText('Nombre');
    await user.clear(name);
    await user.type(name, 'Sanitas Colombia');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith('tok', 'payer-1', {
        name: 'Sanitas Colombia',
        type: 'PUBLIC_SYSTEM',
      }),
    );
    expect(await within(table).findByText('Sanitas Colombia')).toBeInTheDocument();
  });

  it('desactiva y activa; si falla avisa con reintento y no cambia la lista', async () => {
    const user = setupUser();
    mockedUpdate.mockResolvedValueOnce({ ...sanitas, active: false });
    render(<PayersManager token="tok" allowed />);
    const table = await screen.findByRole('table', { name: 'Pagadores' });

    await rowAction(user, 'Sanitas', 'Desactivar');
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith('tok', 'payer-1', { active: false }));
    // Sanitas pasa a llevar la marca de inactivo, como Acme.
    await waitFor(() => expect(within(table).getAllByText('Inactivo')).toHaveLength(2));

    mockedUpdate.mockRejectedValueOnce(new ApiError(500, 'Caído'));
    await rowAction(user, 'Acme', 'Reactivar');
    await waitFor(() => expect(mockedNotify).toHaveBeenCalledTimes(1));
    expect(mockedNotify.mock.calls[0][0]).toBe('No pudimos cambiar el estado de «Acme».');
    expect(mockedNotify.mock.calls[0][1]).toEqual({ onRetry: expect.any(Function) });
    expect(within(table).getAllByText('Inactivo')).toHaveLength(2);
  });

  it('retira con confirmación', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([sanitas]);
    mockedDelete.mockResolvedValue(undefined);
    render(<PayersManager token="tok" allowed />);
    await screen.findByRole('table', { name: 'Pagadores' });

    await rowAction(user, 'Sanitas', 'Retirar');
    await user.click(await screen.findByRole('button', { name: 'Retirar pagador' }));
    await waitFor(() => expect(mockedDelete).toHaveBeenCalledWith('tok', 'payer-1'));
    await waitFor(() =>
      expect(screen.queryByRole('table', { name: 'Pagadores' })).not.toBeInTheDocument(),
    );
    // La fila retirada ya no existe: el foco pasa a «Nuevo pagador», no a <body>.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Nuevo pagador' })).toHaveFocus());
  });

  it('el 409 por coberturas vivas se muestra en el diálogo y el pagador sigue en la lista', async () => {
    const user = setupUser();
    const message = 'Este pagador tiene coberturas asociadas; desactívalo en lugar de retirarlo.';
    mockedDelete.mockRejectedValue(new ApiError(409, message));
    render(<PayersManager token="tok" allowed />);
    const table = await screen.findByRole('table', { name: 'Pagadores' });

    await rowAction(user, 'Sanitas', 'Retirar');
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Retirar pagador' }));

    expect(await within(dialog).findByText(message)).toBeInTheDocument();
    expect(within(table).getByText('Sanitas')).toBeInTheDocument();
    expect(mockedNotify).not.toHaveBeenCalled();
  });
});
