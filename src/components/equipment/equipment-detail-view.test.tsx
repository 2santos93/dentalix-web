import { render, screen, waitFor } from '@testing-library/react';
import { EquipmentDetailView } from './equipment-detail-view';
import { getEquipment, voidMaintenance } from '@/lib/equipment/equipment-api';
import { listLocations } from '@/lib/locations/locations-api';
import { ApiError } from '@/lib/api/client';
import { clinicLocation } from '@/lib/test/locations';
import { equipmentDetailFixture, maintenanceFixture } from '@/lib/test/equipment';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/equipment/equipment-api', () => ({
  ...jest.requireActual('../../lib/equipment/equipment-api'),
  getEquipment: jest.fn(),
  voidMaintenance: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));

const mockedGet = getEquipment as jest.MockedFunction<typeof getEquipment>;
const mockedVoid = voidMaintenance as jest.MockedFunction<typeof voidMaintenance>;
const norte = clinicLocation({ id: 'norte', name: 'Sede Norte', locale: 'es-VE', hourCycle: 'h23' });

const detail = equipmentDetailFixture({
  id: 'e1',
  name: 'Autoclave',
  maintenances: [maintenanceFixture({ id: 'm1', performedOn: '2026-10-01', description: 'Revisión' })],
});

function renderView() {
  return render(<EquipmentDetailView token="tok" equipmentId="e1" locations={[norte]} />);
}

describe('EquipmentDetailView (DX-542)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (listLocations as jest.Mock).mockResolvedValue([norte]);
  });

  it('«Imprimir hoja de vida» abre la imprimible en otra pestaña, como las demás', async () => {
    mockedGet.mockResolvedValue(detail);
    const open = jest.spyOn(window, 'open').mockImplementation(() => null);
    renderView();
    const user = setupUser();
    await user.click(await screen.findByRole('button', { name: 'Imprimir hoja de vida' }));
    expect(open).toHaveBeenCalledWith('/print/equipment/e1', '_blank', 'noopener');
    open.mockRestore();
  });

  it('si la recarga tras anular falla, no deja la hoja antigua: escalón 1 con reintento', async () => {
    mockedGet.mockResolvedValueOnce(detail).mockRejectedValueOnce(new ApiError(500, 'Error interno'));
    mockedVoid.mockResolvedValue(
      maintenanceFixture({ id: 'm1', performedOn: '2026-10-01', voidedAt: '2026-11-06T12:00:00.000Z', voidReason: 'Error' }),
    );
    renderView();
    const user = setupUser();
    await user.click(await screen.findByRole('button', { name: /Anular el mantenimiento del/ }));
    await user.type(screen.getByLabelText('Motivo'), 'Mal cargado');
    await user.click(screen.getByRole('button', { name: 'Anular mantenimiento' }));
    const alert = await screen.findByRole('alert');
    expect(screen.queryByTestId('life-sheet-maintenance')).toBeNull();
    mockedGet.mockResolvedValue({
      ...detail,
      maintenances: [{ ...detail.maintenances[0], voidedAt: '2026-11-06T12:00:00.000Z', voidReason: 'Mal cargado' }],
    });
    await user.click(alert.querySelector('button')!);
    await waitFor(() => expect(screen.getByText('Anulado')).toBeInTheDocument());
    expect(mockedGet).toHaveBeenCalledTimes(3);
  });
});
