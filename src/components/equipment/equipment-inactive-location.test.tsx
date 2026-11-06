import { render, screen, waitFor, within } from '@testing-library/react';
import { EquipmentDetailView } from './equipment-detail-view';
import { EquipmentManager } from './equipment-manager';
import { getEquipment, listEquipment } from '@/lib/equipment/equipment-api';
import { listLocations } from '@/lib/locations/locations-api';
import { sedeToday } from '@/lib/locations/use-sede-time-zone';
import { clinicLocation } from '@/lib/test/locations';
import { equipmentDetailFixture, equipmentFixture } from '@/lib/test/equipment';
import { setupUser } from '@/lib/test/user';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../../lib/equipment/equipment-api', () => ({
  ...jest.requireActual('../../lib/equipment/equipment-api'),
  getEquipment: jest.fn(),
  listEquipment: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
jest.mock('../../lib/chairs/chairs-api', () => ({
  ...jest.requireActual('../../lib/chairs/chairs-api'),
  listChairs: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../lib/reference/currencies-api', () => ({
  listCurrencies: jest.fn().mockResolvedValue([
    { code: 'USD', name: 'Dólar', symbol: '$' },
    { code: 'EUR', name: 'Euro', symbol: '€' },
  ]),
}));

const mockedGet = getEquipment as jest.MockedFunction<typeof getEquipment>;
const mockedList = listEquipment as jest.MockedFunction<typeof listEquipment>;

const norte = clinicLocation({ id: 'norte', name: 'Sede Norte', locale: 'es-VE', hourCycle: 'h23' });
// Una sede cerrada, en otra zona y con otra moneda: su «hoy» y su moneda no son los de Norte.
const vieja = clinicLocation({
  id: 'vieja',
  name: 'Sede Vieja',
  isActive: false,
  timeZone: 'Pacific/Kiritimati',
  currency: 'EUR',
  locale: 'es-ES',
  hourCycle: 'h23',
});
const locations = [norte, vieja];

const inVieja = equipmentDetailFixture({ id: 'e1', name: 'Autoclave', locationId: 'vieja', locationName: 'Sede Vieja' });

const hiddenDate = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"]`);

/**
 * DX-546 · FE-112: un equipo de una sede desactivada (con «Todas las sedes»,
 * ADMIN los ve) se edita, se mantiene y se da de baja con SU sede: su «hoy»,
 * su moneda y, en «Editar», su sede como valor real del select.
 */
describe('equipo de una sede desactivada (DX-546 · FE-112)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (listLocations as jest.Mock).mockResolvedValue(locations);
    mockedGet.mockResolvedValue(inVieja);
  });

  it('«Registrar mantenimiento» parte del «hoy» y de la moneda de la sede del equipo', async () => {
    render(<EquipmentDetailView token="tok" equipmentId="e1" locations={locations} />);
    const user = setupUser();
    await user.click(await screen.findByRole('button', { name: 'Registrar mantenimiento' }));
    const dialog = await screen.findByRole('dialog');
    expect(hiddenDate('performedOn')).toHaveValue(sedeToday('Pacific/Kiritimati'));
    await waitFor(() => expect(within(dialog).getByLabelText('Moneda')).toHaveValue('EUR'));
  });

  it('«Dar de baja» pide la fecha, con el «hoy» de la sede del equipo', async () => {
    render(<EquipmentDetailView token="tok" equipmentId="e1" locations={locations} />);
    const user = setupUser();
    await user.click(await screen.findByRole('button', { name: 'Dar de baja' }));
    await screen.findByRole('dialog');
    expect(hiddenDate('date')).toHaveValue(sedeToday('Pacific/Kiritimati'));
  });

  it('«Editar»: el select de sede muestra la sede del equipo («inactiva») y explica que hay que reubicarlo', async () => {
    render(<EquipmentDetailView token="tok" equipmentId="e1" locations={locations} />);
    const user = setupUser();
    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    const dialog = await screen.findByRole('dialog');
    const select = within(dialog).getByLabelText('Sede') as HTMLSelectElement;
    expect(select).toHaveValue('vieja');
    expect(select.selectedOptions[0]).toHaveTextContent('Sede Vieja (inactiva)');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Sede Norte',
      'Sede Vieja (inactiva)',
    ]);
    expect(within(dialog).getByText('Esta sede está desactivada. Elige una sede activa para reubicar el equipo.')).toBeInTheDocument();
    // Elegir la sede activa es un cambio real: aparece el aviso de que se mueve.
    await user.selectOptions(select, 'norte');
    expect(select).toHaveValue('norte');
    expect(
      within(dialog).getByText('Al cambiar de sede se quita el sillón, salvo que elijas uno de la sede nueva.'),
    ).toBeInTheDocument();
  });

  it('desde la lista: «Nuevo equipo» solo ofrece sedes activas y un equipo de la sede cerrada se mantiene con su moneda', async () => {
    mockedList.mockResolvedValue({
      items: [equipmentFixture({ id: 'e1', name: 'Autoclave', locationId: 'vieja', locationName: 'Sede Vieja' })],
      total: 1,
      page: 1,
      pageSize: 50,
    });
    render(<EquipmentManager token="tok" allowed locations={locations} initialLocationId={null} />);
    const user = setupUser();
    await user.click(await screen.findByRole('button', { name: 'Nuevo equipo' }));
    let dialog = await screen.findByRole('dialog');
    const select = within(dialog).getByLabelText('Sede');
    expect(select).toHaveValue('norte');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Sede Norte']);
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await user.click(screen.getByRole('button', { name: /Acciones/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Registrar mantenimiento' }));
    dialog = await screen.findByRole('dialog');
    expect(hiddenDate('performedOn')).toHaveValue(sedeToday('Pacific/Kiritimati'));
    await waitFor(() => expect(within(dialog).getByLabelText('Moneda')).toHaveValue('EUR'));
  });
});
