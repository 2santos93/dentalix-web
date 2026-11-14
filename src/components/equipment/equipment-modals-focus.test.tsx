import { render, screen } from '@testing-library/react';
import { EquipmentFormModal } from './equipment-form-modal';
import { EquipmentReasonModal } from './equipment-reason-modal';
import { MaintenanceFormModal } from './maintenance-form-modal';
import { createEquipment, recordMaintenance } from '@/lib/equipment/equipment-api';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';
import { equipmentFixture } from '@/lib/test/equipment';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/equipment/equipment-api', () => ({
  ...jest.requireActual('../../lib/equipment/equipment-api'),
  createEquipment: jest.fn(),
  recordMaintenance: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
jest.mock('../../lib/chairs/chairs-api', () => ({
  ...jest.requireActual('../../lib/chairs/chairs-api'),
  listChairs: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../lib/reference/currencies-api', () => ({
  listCurrencies: jest.fn().mockResolvedValue([{ code: 'USD', name: 'Dólar', symbol: '$' }]),
}));

const norte = clinicLocation({ id: 'norte', name: 'Sede Norte', locale: 'es-VE', hourCycle: 'h23' });

/**
 * DX-546 · FE-113: con `ownValidation`, al fallar la validación el foco va al
 * primer campo con error (en la hoja del teléfono el error puede quedar fuera
 * de la vista y el foco, en el botón fijo del pie).
 */
describe('modales de equipos: foco en el primer error (DX-546 · FE-113)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (listLocations as jest.Mock).mockResolvedValue([norte]);
  });

  it('«Nuevo equipo» sin nombre: el foco va a «Nombre»', async () => {
    render(
      <EquipmentFormModal open onOpenChange={jest.fn()} token="tok" locations={[norte]} defaultLocationId="norte" onSaved={jest.fn()} />,
    );
    const user = setupUser();
    await user.type(screen.getByLabelText('Mantenimiento preventivo cada (meses)'), '0');
    await user.click(screen.getByRole('button', { name: 'Crear equipo' }));
    expect(await screen.findByText('Escribe el nombre del equipo (hasta 120 caracteres).')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toHaveFocus();
    expect(createEquipment).not.toHaveBeenCalled();
  });

  it('«Nuevo equipo» con nombre y una periodicidad mal escrita: el foco va a la periodicidad', async () => {
    render(
      <EquipmentFormModal open onOpenChange={jest.fn()} token="tok" locations={[norte]} defaultLocationId="norte" onSaved={jest.fn()} />,
    );
    const user = setupUser();
    await user.type(screen.getByLabelText('Nombre'), 'Autoclave');
    await user.type(screen.getByLabelText('Mantenimiento preventivo cada (meses)'), '200');
    await user.click(screen.getByRole('button', { name: 'Crear equipo' }));
    expect(await screen.findByText('Escribe un número entero de 1 a 120, o déjalo vacío.')).toBeInTheDocument();
    expect(screen.getByLabelText('Mantenimiento preventivo cada (meses)')).toHaveFocus();
  });

  it('«Registrar mantenimiento» sin descripción ni un costo válido: el foco va al primero, «Qué se hizo»', async () => {
    render(
      <MaintenanceFormModal
        open
        onOpenChange={jest.fn()}
        token="tok"
        equipment={equipmentFixture({ id: 'e1', name: 'Autoclave' })}
        location={norte}
        onSaved={jest.fn()}
      />,
    );
    const user = setupUser();
    await user.type(screen.getByLabelText('Costo (opcional)'), 'abc');
    await user.click(screen.getByRole('button', { name: 'Registrar mantenimiento' }));
    expect(await screen.findByText('Describe qué se hizo (hasta 2000 caracteres).')).toBeInTheDocument();
    expect(screen.getByLabelText('Qué se hizo')).toHaveFocus();
    expect(recordMaintenance).not.toHaveBeenCalled();
  });

  it('«Dar de baja» sin motivo: el foco va a «Motivo»', async () => {
    const onConfirm = jest.fn();
    render(
      <EquipmentReasonModal
        open
        onOpenChange={jest.fn()}
        title="¿Dar de baja «Autoclave»?"
        description="No se puede deshacer."
        submitLabel="Dar de baja"
        fallbackError="No pudimos."
        withDate={{ today: '2026-11-06' }}
        onConfirm={onConfirm}
      />,
    );
    const user = setupUser();
    await user.click(screen.getByRole('button', { name: 'Dar de baja' }));
    expect(await screen.findByText('Escribe el motivo (de 3 a 500 caracteres).')).toBeInTheDocument();
    expect(screen.getByLabelText('Motivo')).toHaveFocus();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
