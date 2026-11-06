import { render, screen, waitFor } from '@testing-library/react';
import { MaintenanceFormModal } from './maintenance-form-modal';
import { recordMaintenance } from '@/lib/equipment/equipment-api';
import { listLocations } from '@/lib/locations/locations-api';
import { ApiError } from '@/lib/api/client';
import { sedeToday } from '@/lib/locations/use-sede-time-zone';
import { clinicLocation } from '@/lib/test/locations';
import { equipmentFixture, maintenanceFixture } from '@/lib/test/equipment';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/equipment/equipment-api', () => ({
  ...jest.requireActual('../../lib/equipment/equipment-api'),
  recordMaintenance: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
jest.mock('../../lib/reference/currencies-api', () => ({
  listCurrencies: jest.fn().mockResolvedValue([
    { code: 'USD', name: 'Dólar', symbol: '$' },
    { code: 'VES', name: 'Bolívar', symbol: 'Bs' },
  ]),
}));

const mockedRecord = recordMaintenance as jest.MockedFunction<typeof recordMaintenance>;
const norte = clinicLocation({ id: 'norte', name: 'Sede Norte', locale: 'es-VE', hourCycle: 'h23' });
const equipment = equipmentFixture({ id: 'e1', name: 'Autoclave', maintenanceIntervalMonths: 6 });

function renderModal(onSaved = jest.fn()) {
  render(
    <MaintenanceFormModal
      open
      onOpenChange={jest.fn()}
      token="tok"
      equipment={equipment}
      location={norte}
      onSaved={onSaved}
    />,
  );
  return onSaved;
}

describe('MaintenanceFormModal (DX-542)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (listLocations as jest.Mock).mockResolvedValue([norte]);
  });

  it('un preventivo de hoy anuncia el próximo por la periodicidad y lo registra con la moneda de la sede', async () => {
    const onSaved = renderModal();
    expect(await screen.findByText(/se programa para el .+ por la periodicidad del equipo/)).toBeInTheDocument();
    const user = setupUser();
    await user.type(screen.getByLabelText('Qué se hizo'), 'Prueba de vacío');
    await user.type(screen.getByLabelText('Costo (opcional)'), '85,50');
    mockedRecord.mockResolvedValue(maintenanceFixture({ id: 'm1', performedOn: sedeToday('America/Caracas') }));
    await user.click(screen.getByRole('button', { name: 'Registrar mantenimiento' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(mockedRecord).toHaveBeenCalledWith('tok', 'e1', {
      kind: 'PREVENTIVE',
      performedOn: sedeToday('America/Caracas'),
      technician: null,
      company: null,
      description: 'Prueba de vacío',
      cost: 85.5,
      currency: 'USD',
    });
  });

  it('sin descripción no envía y lo dice junto al campo', async () => {
    renderModal();
    const user = setupUser();
    await user.click(screen.getByRole('button', { name: 'Registrar mantenimiento' }));
    expect(await screen.findByText('Describe qué se hizo (hasta 2000 caracteres).')).toBeInTheDocument();
    expect(screen.getByLabelText('Qué se hizo')).toHaveAttribute('aria-invalid', 'true');
    expect(mockedRecord).not.toHaveBeenCalled();
  });

  it('un correctivo no programa nada y el rechazo de la API sale en el formulario', async () => {
    renderModal();
    const user = setupUser();
    await user.selectOptions(screen.getByLabelText('Tipo'), 'CORRECTIVE');
    expect(screen.getByText('Si lo dejas vacío, este mantenimiento no programa el siguiente.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Qué se hizo'), 'Cambio de empaque');
    mockedRecord.mockRejectedValue(new ApiError(409, 'El equipo está dado de baja: ya no se edita ni se le registran mantenimientos.'));
    await user.click(screen.getByRole('button', { name: 'Registrar mantenimiento' }));
    expect(await screen.findByText(/El equipo está dado de baja/)).toBeInTheDocument();
  });
});
