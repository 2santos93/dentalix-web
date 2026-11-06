import { render, screen, within } from '@testing-library/react';
import { EquipmentLifeSheet } from './equipment-life-sheet';
import { clinicLocation } from '@/lib/test/locations';
import { equipmentDetailFixture, maintenanceFixture } from '@/lib/test/equipment';
import { testStamp } from '@/lib/test/stamp';

const norte = clinicLocation({ id: 'norte', name: 'Sede Norte', locale: 'es-VE', hourCycle: 'h23' });
const stamp = testStamp([norte], 'norte');

describe('EquipmentLifeSheet (DX-542)', () => {
  it('pinta los datos del equipo, su programa y los mantenimientos en el orden que llegan (cronológico), con el anulado tachado y su motivo', () => {
    render(
      <EquipmentLifeSheet
        stamp={stamp}
        equipment={equipmentDetailFixture({
          id: 'e1',
          name: 'Autoclave clase B',
          brand: 'Tuttnauer',
          serialNumber: 'SN-1',
          sanitaryRegistration: 'REG-1',
          riskClass: 'IIB',
          acquiredOn: '2024-01-15',
          maintenanceIntervalMonths: 6,
          nextMaintenanceOn: '2027-05-02',
          maintenanceStatus: 'UP_TO_DATE',
          maintenances: [
            maintenanceFixture({ id: 'm1', kind: 'CORRECTIVE', performedOn: '2026-03-15', description: 'Empaque' }),
            maintenanceFixture({
              id: 'm2',
              performedOn: '2026-11-02',
              description: 'Prueba de vacío',
              cost: 85.5,
              currency: 'USD',
              nextDueOn: '2027-05-02',
              technician: 'Luis Pérez',
            }),
            maintenanceFixture({
              id: 'm3',
              performedOn: '2026-11-03',
              description: 'Mal cargado',
              voidedAt: '2026-11-04T15:00:00.000Z',
              voidReason: 'Equipo equivocado',
            }),
          ],
        })}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Autoclave clase B' })).toBeInTheDocument();
    expect(screen.getByText('Clase IIb')).toBeInTheDocument();
    expect(screen.getByText('Cada 6 meses')).toBeInTheDocument();
    expect(screen.getByText('Al día')).toBeInTheDocument();
    const items = screen.getAllByTestId('life-sheet-maintenance');
    expect(items.map((i) => i.getAttribute('data-voided'))).toEqual(['false', 'false', 'true']);
    expect(items[0]).toHaveTextContent('15/03/2026 · Correctivo');
    expect(items[1]).toHaveTextContent('Luis Pérez');
    expect(items[1]).toHaveTextContent('USD');
    expect(items[1]).toHaveTextContent('02/05/2027');
    expect(within(items[2]).getByText('ANULADO')).toBeInTheDocument();
    expect(items[2]).toHaveTextContent('Equipo equivocado');
  });

  it('sin mantenimientos lo dice, y un equipo dado de baja enseña la fecha y el motivo', () => {
    render(
      <EquipmentLifeSheet
        stamp={stamp}
        equipment={equipmentDetailFixture({
          id: 'e2',
          name: 'Rayos X',
          status: 'RETIRED',
          retiredOn: '2026-10-01',
          retiredReason: 'Reemplazado',
          maintenanceStatus: null,
        })}
      />,
    );
    expect(screen.getByText('Todavía no tiene mantenimientos registrados.')).toBeInTheDocument();
    expect(screen.getByText('Dado de baja el 01/10/2026: Reemplazado')).toBeInTheDocument();
    expect(screen.getByText('Dado de baja')).toBeInTheDocument();
  });
});
