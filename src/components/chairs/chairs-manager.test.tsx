import { render, screen, waitFor } from '@testing-library/react';
import { ChairsManager } from './chairs-manager';
import {
  createChair,
  listChairs,
  reorderChairs,
  setChairActive,
  type Chair,
} from '@/lib/chairs/chairs-api';
import { listStaff } from '@/lib/appointments/staff-api';
import { listAppointments } from '@/lib/appointments/appointments-api';
import { updateChair } from '@/lib/chairs/chairs-api';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/chairs/chairs-api', () => ({
  ...jest.requireActual('../../lib/chairs/chairs-api'),
  listChairs: jest.fn(),
  createChair: jest.fn(),
  updateChair: jest.fn(),
  setChairActive: jest.fn(),
  reorderChairs: jest.fn(),
}));
jest.mock('../../lib/appointments/staff-api', () => ({
  ...jest.requireActual('../../lib/appointments/staff-api'),
  listStaff: jest.fn(),
}));
jest.mock('../../lib/appointments/appointments-api', () => ({
  ...jest.requireActual('../../lib/appointments/appointments-api'),
  listAppointments: jest.fn(),
}));
jest.mock('../errors/notify', () => ({ notifyError: jest.fn() }));

const mockedList = listChairs as jest.MockedFunction<typeof listChairs>;
const mockedCreate = createChair as jest.MockedFunction<typeof createChair>;
const mockedActive = setChairActive as jest.MockedFunction<typeof setChairActive>;
const mockedReorder = reorderChairs as jest.MockedFunction<typeof reorderChairs>;
const mockedStaff = listStaff as jest.MockedFunction<typeof listStaff>;
const mockedAppointments = listAppointments as jest.MockedFunction<typeof listAppointments>;
const mockedUpdateChair = updateChair as jest.MockedFunction<typeof updateChair>;

const norte = { id: 'norte', name: 'Sede Norte' } as ClinicLocation;
const sur = { id: 'sur', name: 'Sede Sur' } as ClinicLocation;

function chair(partial: Partial<Chair> & { id: string; name: string }): Chair {
  return {
    tenantId: 't1',
    locationId: 'norte',
    sortOrder: 0,
    defaultProviderId: null,
    active: true,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...partial,
  };
}

const one = chair({ id: 'c1', name: 'Sillón 1', sortOrder: 0, defaultProviderId: 'dra' });
const two = chair({ id: 'c2', name: 'Sillón 2', sortOrder: 1 });

function renderManager(allowed = true) {
  return render(
    <ChairsManager token="tok" allowed={allowed} locations={[norte, sur]} initialLocationId="norte" />,
  );
}

describe('ChairsManager (DX-211)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedStaff.mockResolvedValue([
      { userId: 'dra', fullName: 'Dra. Ana', role: 'DENTIST' },
      { userId: 'rec', fullName: 'Recepción', role: 'RECEPTION' },
    ] as Awaited<ReturnType<typeof listStaff>>);
  });

  it('lista los sillones de la sede activa en su orden, con su profesional por defecto', async () => {
    mockedList.mockResolvedValue([two, one]);
    renderManager();
    const rows = await screen.findAllByRole('row');
    expect(rows.slice(1).map((r) => r.textContent)).toEqual([
      expect.stringContaining('Sillón 1'),
      expect.stringContaining('Sillón 2'),
    ]);
    expect(screen.getByText('Dra. Ana')).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledWith('tok', 'norte', { includeInactive: true });
  });

  it('sede sin sillones: estado vacío con «Crear sillón»', async () => {
    mockedList.mockResolvedValue([]);
    renderManager();
    expect(await screen.findByText('Esta sede no tiene sillones')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Crear sillón/ })).toBeInTheDocument();
  });

  it('error al cargar: aviso con «Reintentar» que vuelve a pedir', async () => {
    const user = setupUser();
    mockedList.mockRejectedValueOnce(new Error('boom')).mockResolvedValue([one]);
    renderManager();
    await user.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Sillón 1')).toBeInTheDocument();
  });

  it('cambiar de sede pide los sillones de esa sede', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([]);
    renderManager();
    await screen.findByText('Esta sede no tiene sillones');
    await user.selectOptions(screen.getByLabelText('Sede'), 'sur');
    await waitFor(() => expect(mockedList).toHaveBeenLastCalledWith('tok', 'sur', { includeInactive: true }));
  });

  it('crea un sillón con su profesional por defecto (solo quien atiende) y muestra el 409 de la API', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([one]);
    mockedCreate
      .mockRejectedValueOnce(new ApiError(409, 'Ya existe un sillón con ese nombre en esta sede.'))
      .mockResolvedValue(chair({ id: 'c3', name: 'Sillón 3', sortOrder: 1 }));
    renderManager();
    await screen.findByText('Sillón 1');
    await user.click(screen.getByRole('button', { name: /Nuevo sillón/ }));
    await user.type(screen.getByLabelText('Nombre'), 'Sillón 1');
    const provider = screen.getByLabelText('Profesional por defecto (opcional)');
    expect(screen.queryByRole('option', { name: 'Recepción' })).not.toBeInTheDocument();
    await user.selectOptions(provider, 'dra');
    await user.click(screen.getByRole('button', { name: 'Crear sillón' }));
    expect(await screen.findByText('Ya existe un sillón con ese nombre en esta sede.')).toBeInTheDocument();
    expect(mockedCreate).toHaveBeenCalledWith('tok', {
      locationId: 'norte',
      name: 'Sillón 1',
      defaultProviderId: 'dra',
    });
    await user.clear(screen.getByLabelText('Nombre'));
    await user.type(screen.getByLabelText('Nombre'), 'Sillón 3');
    await user.click(screen.getByRole('button', { name: 'Crear sillón' }));
    expect(await screen.findByText('Sillón 3')).toBeInTheDocument();
  });

  it('desactiva (sin borrar) y baja un sillón en el orden', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([one, two]);
    mockedActive.mockResolvedValue({ ...one, active: false });
    mockedReorder.mockResolvedValue([
      { ...two, sortOrder: 0 },
      { ...one, sortOrder: 1 },
    ]);
    renderManager();
    await screen.findByText('Sillón 1');
    await user.click(screen.getByRole('button', { name: 'Acciones de Sillón 1' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Bajar' }));
    await waitFor(() => expect(mockedReorder).toHaveBeenCalledWith('tok', 'norte', ['c2', 'c1']));
    mockedAppointments.mockResolvedValue([
      { id: 'a1', status: 'SCHEDULED' },
      { id: 'a2', status: 'CONFIRMED' },
      { id: 'a3', status: 'CANCELLED' },
    ] as Awaited<ReturnType<typeof listAppointments>>);
    await user.click(screen.getByRole('button', { name: 'Acciones de Sillón 1' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Desactivar' }));
    // Revisión B5: pide confirmación y dice cuántas citas futuras tiene.
    expect(await screen.findByText('Tiene 2 citas futuras: las conserva y se verán con «(inactivo)».')).toBeInTheDocument();
    expect(mockedAppointments).toHaveBeenCalledWith(
      'tok',
      expect.objectContaining({ locationId: 'norte', chairIds: ['c1'] }),
    );
    expect(mockedActive).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Desactivar sillón' }));
    await waitFor(() => expect(mockedActive).toHaveBeenCalledWith('tok', 'c1', false));
    expect(await screen.findByText('Inactivo')).toBeInTheDocument();
  });

  it('sin ADMIN no se carga nada y se explica', () => {
    renderManager(false);
    expect(screen.getByText('Solo administración gestiona los sillones.')).toBeInTheDocument();
    expect(mockedList).not.toHaveBeenCalled();
  });

  it('revisión B3: al editar no reenvía el profesional si no cambió y muestra el actual «(no disponible)»', async () => {
    const user = setupUser();
    const orphan = chair({ id: 'c9', name: 'Sillón 9', defaultProviderId: 'rec' });
    mockedList.mockResolvedValue([orphan]);
    mockedUpdateChair.mockResolvedValue({ ...orphan, name: 'Sillón 10' });
    renderManager();
    await screen.findByText('Sillón 9');
    await user.click(screen.getByRole('button', { name: 'Acciones de Sillón 9' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Editar' }));
    expect(screen.getByRole('option', { name: 'Recepción (no disponible)' })).toBeInTheDocument();
    expect(screen.getByLabelText('Profesional por defecto (opcional)')).toHaveValue('rec');
    await user.clear(screen.getByLabelText('Nombre'));
    await user.type(screen.getByLabelText('Nombre'), 'Sillón 10');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(mockedUpdateChair).toHaveBeenCalledWith('tok', 'c9', { name: 'Sillón 10' }));
  });
});
