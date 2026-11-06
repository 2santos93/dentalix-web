import { act, render, screen, waitFor, within } from '@testing-library/react';
import { EquipmentManager } from './equipment-manager';
import { listEquipment, type Equipment } from '@/lib/equipment/equipment-api';
import { listLocations } from '@/lib/locations/locations-api';
import { ApiError } from '@/lib/api/client';
import { clinicLocation } from '@/lib/test/locations';
import { equipmentFixture } from '@/lib/test/equipment';
import { setupUser } from '@/lib/test/user';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../../lib/equipment/equipment-api', () => ({
  ...jest.requireActual('../../lib/equipment/equipment-api'),
  listEquipment: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
jest.mock('../../lib/chairs/chairs-api', () => ({
  ...jest.requireActual('../../lib/chairs/chairs-api'),
  listChairs: jest.fn().mockResolvedValue([]),
}));

const mockedList = listEquipment as jest.MockedFunction<typeof listEquipment>;
const mockedLocations = listLocations as jest.MockedFunction<typeof listLocations>;

const norte = clinicLocation({ id: 'norte', name: 'Sede Norte', locale: 'es-VE', hourCycle: 'h23' });
const sur = clinicLocation({ id: 'sur', name: 'Sede Sur', locale: 'es-VE', hourCycle: 'h23' });

function page(items: Equipment[]) {
  return { items, total: items.length, page: 1, pageSize: 50 };
}

function renderManager(allowed = true) {
  return render(
    <EquipmentManager token="tok" allowed={allowed} locations={[norte, sur]} initialLocationId="norte" />,
  );
}

describe('EquipmentManager (DX-542)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedLocations.mockResolvedValue([norte, sur]);
  });

  it('lista los equipos de la sede activa con su próximo mantenimiento y si está vencido o vence pronto', async () => {
    mockedList.mockResolvedValue(
      page([
        equipmentFixture({
          id: 'e1',
          name: 'Autoclave',
          brand: 'Tuttnauer',
          chairName: 'Sillón 1',
          nextMaintenanceOn: '2026-05-10',
          maintenanceStatus: 'OVERDUE',
        }),
        equipmentFixture({
          id: 'e2',
          name: 'Compresor',
          category: 'COMPRESSOR',
          nextMaintenanceOn: '2026-11-20',
          maintenanceStatus: 'DUE_SOON',
        }),
      ]),
    );
    renderManager();
    const table = await screen.findByRole('table', { name: 'Equipos biomédicos' });
    expect(mockedList).toHaveBeenCalledWith('tok', expect.objectContaining({ locationId: 'norte', status: 'ACTIVE' }));
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Autoclave');
    expect(rows[1]).toHaveTextContent('Autoclave · Tuttnauer');
    expect(rows[1]).toHaveTextContent('Vencido');
    await waitFor(() => expect(rows[1]).toHaveTextContent('10/05/2026'));
    expect(rows[2]).toHaveTextContent('Vence pronto');
    expect(screen.getByText('2 equipos')).toBeInTheDocument();
  });

  it('sin equipos enseña el estado vacío con la acción de crear', async () => {
    mockedList.mockResolvedValue(page([]));
    renderManager();
    expect(await screen.findByText('Todavía no hay equipos en esta sede')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear equipo' })).toBeInTheDocument();
  });

  it('un fallo de carga es el escalón 1 con reintento, que vuelve a pedir la lista', async () => {
    mockedList.mockRejectedValueOnce(new ApiError(500, 'Error interno')).mockResolvedValue(page([]));
    renderManager();
    const alert = await screen.findByRole('alert');
    const user = setupUser();
    await user.click(within(alert).getByRole('button'));
    expect(await screen.findByText('Todavía no hay equipos en esta sede')).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledTimes(2);
  });

  it('filtra por estado y por todas las sedes', async () => {
    mockedList.mockResolvedValue(page([]));
    renderManager();
    await screen.findByText('Todavía no hay equipos en esta sede');
    const user = setupUser();
    await user.selectOptions(screen.getByLabelText('Estado'), 'RETIRED');
    await user.selectOptions(screen.getByLabelText('Sede'), '');
    await waitFor(() =>
      expect(mockedList).toHaveBeenLastCalledWith('tok', expect.objectContaining({ locationId: undefined, status: 'RETIRED' })),
    );
  });

  it('quien no es ADMIN ve el aviso y no se pide nada', async () => {
    renderManager(false);
    await act(async () => {});
    expect(screen.getByText('Solo administración gestiona los equipos biomédicos.')).toBeInTheDocument();
    expect(mockedList).not.toHaveBeenCalled();
  });
});
