import { render, screen, waitFor, within } from '@testing-library/react';
import { AppointmentTypesManager } from './appointment-types-manager';
import {
  createAppointmentType,
  deleteAppointmentType,
  listAppointmentTypes,
  updateAppointmentType,
} from '@/lib/appointments/appointment-types-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/appointments/appointment-types-api', () => ({
  ...jest.requireActual('../../lib/appointments/appointment-types-api'),
  listAppointmentTypes: jest.fn(),
  createAppointmentType: jest.fn(),
  updateAppointmentType: jest.fn(),
  deleteAppointmentType: jest.fn(),
}));
jest.mock('../errors/notify', () => ({ notifyError: jest.fn() }));

const mockedList = listAppointmentTypes as jest.MockedFunction<typeof listAppointmentTypes>;
const mockedCreate = createAppointmentType as jest.MockedFunction<typeof createAppointmentType>;
const mockedUpdate = updateAppointmentType as jest.MockedFunction<typeof updateAppointmentType>;
const mockedDelete = deleteAppointmentType as jest.MockedFunction<typeof deleteAppointmentType>;

const endo = {
  id: 'type-1',
  tenantId: 't1',
  name: 'Endodoncia',
  durationMinutes: 90,
  color: '#7C3AED',
  active: true,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

describe('AppointmentTypesManager (DX-121)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedList.mockResolvedValue([endo]);
  });

  it('solo ADMIN: otro rol ve el aviso y no se pide nada', () => {
    render(<AppointmentTypesManager token="tok" allowed={false} />);
    expect(screen.getByText(/solo administración gestiona/i)).toBeInTheDocument();
    expect(mockedList).not.toHaveBeenCalled();
  });

  it('lista activos e inactivos con duración y estado', async () => {
    render(<AppointmentTypesManager token="tok" allowed />);
    const table = await screen.findByRole('table', { name: 'Tipos de cita' });
    const row = within(table).getAllByRole('row')[1];
    expect(row).toHaveTextContent('Endodoncia');
    expect(row).toHaveTextContent('90 min');
    expect(row).toHaveTextContent('Activo');
    expect(mockedList).toHaveBeenCalledWith('tok', { includeInactive: true });
  });

  it('error de carga con reintento', async () => {
    const user = setupUser();
    mockedList.mockRejectedValueOnce(new ApiError(500, 'Caído'));
    render(<AppointmentTypesManager token="tok" allowed />);
    const alert = await screen.findByRole('alert');
    await user.click(within(alert).getByRole('button', { name: /reintentar/i }));
    expect(await screen.findByRole('table', { name: 'Tipos de cita' })).toBeInTheDocument();
  });

  it('crea un tipo: valida #RRGGBB y la duración antes de enviar', async () => {
    const user = setupUser();
    mockedCreate.mockResolvedValue({ ...endo, id: 'type-2', name: 'Urgencia', durationMinutes: 30, color: '#DC2626' });
    render(<AppointmentTypesManager token="tok" allowed />);
    await screen.findByRole('table', { name: 'Tipos de cita' });

    await user.click(screen.getByRole('button', { name: 'Nuevo tipo' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Nombre'), 'Urgencia');
    const hex = within(dialog).getByLabelText('Código del color');
    await user.clear(hex);
    await user.type(hex, 'red');
    await user.click(within(dialog).getByRole('button', { name: 'Crear tipo' }));
    expect(await within(dialog).findByText(/formato #RRGGBB/)).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();

    await user.clear(hex);
    await user.type(hex, '#dc2626');
    const duration = within(dialog).getByLabelText('Duración (minutos)');
    await user.clear(duration);
    await user.type(duration, '30');
    await user.click(within(dialog).getByRole('button', { name: 'Crear tipo' }));

    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith('tok', {
        name: 'Urgencia',
        durationMinutes: 30,
        color: '#DC2626',
      }),
    );
    expect((await screen.findAllByText('Urgencia')).length).toBeGreaterThan(0);
  });

  it('desactivar y retirar (con confirmación)', async () => {
    const user = setupUser();
    mockedUpdate.mockResolvedValue({ ...endo, active: false });
    mockedDelete.mockResolvedValue(undefined);
    render(<AppointmentTypesManager token="tok" allowed />);
    const table = await screen.findByRole('table', { name: 'Tipos de cita' });

    await user.click(within(table).getByRole('button', { name: 'Desactivar «Endodoncia»' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith('tok', 'type-1', { active: false }));
    expect(await within(table).findByText('Inactivo')).toBeInTheDocument();

    await user.click(within(table).getByRole('button', { name: 'Retirar «Endodoncia»' }));
    await user.click(await screen.findByRole('button', { name: 'Retirar tipo' }));
    await waitFor(() => expect(mockedDelete).toHaveBeenCalledWith('tok', 'type-1'));
    await waitFor(() => expect(screen.queryByRole('table', { name: 'Tipos de cita' })).not.toBeInTheDocument());
  });
});
