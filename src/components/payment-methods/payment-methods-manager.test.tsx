import { render, screen, waitFor, within } from '@testing-library/react';
import { PaymentMethodsManager } from './payment-methods-manager';
import {
  createPaymentMethod,
  listPaymentMethods,
  updatePaymentMethod,
  type ClinicPaymentMethod,
} from '@/lib/payments/payment-methods-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/payments/payment-methods-api', () => ({
  ...jest.requireActual('../../lib/payments/payment-methods-api'),
  listPaymentMethods: jest.fn(),
  createPaymentMethod: jest.fn(),
  updatePaymentMethod: jest.fn(),
}));
jest.mock('../errors/notify', () => ({ notifyError: jest.fn() }));

const mockedList = listPaymentMethods as jest.MockedFunction<typeof listPaymentMethods>;
const mockedCreate = createPaymentMethod as jest.MockedFunction<typeof createPaymentMethod>;
const mockedUpdate = updatePaymentMethod as jest.MockedFunction<typeof updatePaymentMethod>;

const cash: ClinicPaymentMethod = {
  id: 'pm-cash',
  name: 'Efectivo',
  kind: 'CASH',
  active: true,
  requiresReference: false,
  legacyMethod: 'CASH',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

describe('PaymentMethodsManager (DX-377)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedList.mockResolvedValue([cash]);
  });

  it('solo ADMIN: otro rol ve el aviso y no se pide nada', () => {
    render(<PaymentMethodsManager token="tok" allowed={false} />);
    expect(screen.getByText(/solo administración gestiona los medios de pago/i)).toBeInTheDocument();
    expect(mockedList).not.toHaveBeenCalled();
  });

  it('lista los medios con tipo base, referencia y estado (activos e inactivos)', async () => {
    render(<PaymentMethodsManager token="tok" allowed />);
    const table = await screen.findByRole('table', { name: 'Medios de pago' });
    const row = within(table).getAllByText('Efectivo')[0].closest('tr') as HTMLElement;
    expect(within(row).getByText('Activo')).toBeInTheDocument();
    expect(within(row).getByText('Opcional')).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledWith('tok', { includeInactive: true });
  });

  it('vacío y error con reintento', async () => {
    mockedList.mockResolvedValueOnce([]);
    const { unmount } = render(<PaymentMethodsManager token="tok" allowed />);
    expect(await screen.findByText('Todavía no hay medios de pago.')).toBeInTheDocument();
    unmount();

    mockedList.mockRejectedValueOnce(new ApiError(500, 'boom'));
    render(<PaymentMethodsManager token="tok" allowed />);
    expect(await screen.findByText(/No pudimos cargar los medios de pago/)).toBeInTheDocument();
  });

  it('crea un medio digital que pide referencia', async () => {
    const user = setupUser();
    mockedCreate.mockResolvedValue({
      ...cash,
      id: 'pm-mobile',
      name: 'Pago móvil',
      kind: 'DIGITAL',
      requiresReference: true,
      legacyMethod: null,
    });
    render(<PaymentMethodsManager token="tok" allowed />);
    await screen.findByRole('table', { name: 'Medios de pago' });
    await user.click(screen.getByRole('button', { name: 'Nuevo medio' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Nombre'), 'Pago móvil');
    await user.click(within(dialog).getByRole('button', { name: 'Crear medio' }));

    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith('tok', {
        name: 'Pago móvil',
        kind: 'DIGITAL',
        requiresReference: true,
      }),
    );
    expect((await screen.findAllByText('Pago móvil')).length).toBeGreaterThan(0);
  });

  it('desactiva un medio', async () => {
    const user = setupUser();
    mockedUpdate.mockResolvedValue({ ...cash, active: false });
    render(<PaymentMethodsManager token="tok" allowed />);
    await screen.findByRole('table', { name: 'Medios de pago' });
    // B7: Editar / Desactivar viven en el «⋯» de la fila.
    await user.click(screen.getByRole('button', { name: 'Acciones de Efectivo' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Desactivar' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith('tok', 'pm-cash', { active: false }));
  });
  it('un medio inicial no cambia de tipo base: el selector está desactivado y explica por qué', async () => {
    const user = setupUser();
    render(<PaymentMethodsManager token="tok" allowed />);
    await screen.findByRole('table', { name: 'Medios de pago' });
    await user.click(screen.getByRole('button', { name: 'Acciones de Efectivo' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Editar' }));
    const dialog = await screen.findByRole('dialog');
    const kind = within(dialog).getByLabelText('Tipo base');
    expect(kind).toBeDisabled();
    expect(kind).toHaveAccessibleDescription(/medio inicial/i);
  });

  it('nombre vacío: el error va en el campo (aria-invalid) y no se envía', async () => {
    const user = setupUser();
    render(<PaymentMethodsManager token="tok" allowed />);
    await screen.findByRole('table', { name: 'Medios de pago' });
    await user.click(screen.getByRole('button', { name: 'Nuevo medio' }));
    const dialog = await screen.findByRole('dialog');
    const nameInput = within(dialog).getByLabelText('Nombre');
    await user.type(nameInput, '   ');
    await user.click(within(dialog).getByRole('button', { name: 'Crear medio' }));
    expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    expect(nameInput).toHaveAccessibleDescription('Escribe un nombre (hasta 60 caracteres).');
    expect(nameInput).toHaveFocus();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('DX-395: nombre sin escribir: mensaje propio en el campo, sin el globo nativo del navegador', async () => {
    const user = setupUser();
    render(<PaymentMethodsManager token="tok" allowed />);
    await screen.findByRole('table', { name: 'Medios de pago' });
    await user.click(screen.getByRole('button', { name: 'Nuevo medio' }));
    const dialog = await screen.findByRole('dialog');
    const nameInput = within(dialog).getByLabelText('Nombre');
    expect(nameInput).not.toHaveAttribute('required');
    expect(nameInput).toHaveAttribute('aria-required', 'true');
    await user.click(within(dialog).getByRole('button', { name: 'Crear medio' }));
    expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    expect(nameInput).toHaveAccessibleDescription('Escribe un nombre (hasta 60 caracteres).');
    expect(nameInput).toHaveFocus();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('DX-395: a 390 px «Nuevo medio» y el modal miden al menos 44 px', async () => {
    const user = setupUser();
    render(<PaymentMethodsManager token="tok" allowed />);
    await screen.findByRole('table', { name: 'Medios de pago' });
    // jsdom no mide: se comprueba la altura táctil por debajo de sm. Editar y
    // Desactivar viven en el «⋯» (DataList: 44 px en la tarjeta del teléfono).
    expect(screen.getByRole('button', { name: 'Nuevo medio' }).className).toContain('max-sm:h-11');
    await user.click(screen.getByRole('button', { name: 'Nuevo medio' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.className).toContain('max-sm:[&_select]:h-11');
    expect(within(dialog).getByRole('button', { name: 'Cerrar' }).className).toContain('max-sm:size-11');
  });
});
