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
    await user.click(screen.getAllByRole('button', { name: 'Desactivar «Efectivo»' })[0]);
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith('tok', 'pm-cash', { active: false }));
  });
});
