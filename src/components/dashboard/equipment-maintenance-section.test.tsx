import { render, screen, waitFor, within } from '@testing-library/react';
import { EquipmentMaintenanceSection, equipmentMaintenanceCopy as copy, dueWhen } from './equipment-maintenance-section';
import { getMaintenanceDue, type MaintenanceDue } from '@/lib/equipment/equipment-api';
import { listLocations } from '@/lib/locations/locations-api';
import { ApiError } from '@/lib/api/client';
import { clinicLocation } from '@/lib/test/locations';
import { maintenanceDueFixture } from '@/lib/test/equipment';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/equipment/equipment-api', () => ({
  ...jest.requireActual('../../lib/equipment/equipment-api'),
  getMaintenanceDue: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));

const mockedDue = jest.mocked(getMaintenanceDue);
const mockedLocations = jest.mocked(listLocations);

const norte = clinicLocation({ id: 'norte', name: 'Sede Norte', locale: 'es-VE', hourCycle: 'h23' });
const principal = clinicLocation({ id: 'principal', name: 'Sede principal', locale: 'es-VE', hourCycle: 'h23' });

function due(items: MaintenanceDue['items'], total = items.length): MaintenanceDue {
  return { generatedAt: '2026-11-06T16:00:00.000Z', items, total };
}

const OVERDUE = maintenanceDueFixture({
  id: 'e1',
  name: 'Unidad dental Sillón 1',
  chairId: 'ch1',
  chairName: 'Sillón 1',
});
const SOON = maintenanceDueFixture({
  id: 'e2',
  name: 'Rayos X periapical',
  category: 'XRAY',
  locationId: 'principal',
  locationName: 'Sede principal',
  nextMaintenanceOn: '2026-11-16',
  maintenanceStatus: 'DUE_SOON',
  daysUntilDue: 10,
});

function renderSection(scopeKey = 'all') {
  return render(<EquipmentMaintenanceSection token="tok" scopeKey={scopeKey} />);
}

describe('EquipmentMaintenanceSection (DX-543)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedLocations.mockResolvedValue([principal, norte]);
  });

  it('lista vencidos y por vencer con equipo, sede, sillón, fecha de su sede, estado y enlace a la hoja de vida', async () => {
    mockedDue.mockResolvedValue(due([OVERDUE, SOON]));
    renderSection();
    const section = screen.getByRole('region', { name: copy.heading });
    expect(within(section).getByRole('heading', { level: 2, name: copy.heading })).toBeInTheDocument();
    const list = await within(section).findByRole('list', { name: copy.listLabel });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);

    const first = rows[0];
    expect(within(first).getByRole('link', { name: 'Unidad dental Sillón 1 (hoja de vida)' })).toHaveAttribute(
      'href',
      '/settings/equipos/e1',
    );
    expect(first).toHaveTextContent('Sede Norte · Sillón 1');
    // El estado es texto (con punto), no solo color.
    const badge = within(first).getByText('Vencido');
    expect(badge.closest('[data-status]')).toHaveAttribute('data-status', 'OVERDUE');
    expect(first).toHaveTextContent('Venció hace 31 días');
    await waitFor(() => expect(first).toHaveTextContent('06/10/2026'));

    const second = rows[1];
    expect(second).toHaveTextContent('Rayos X periapical');
    expect(second).toHaveTextContent('Sede principal');
    expect(second).not.toHaveTextContent('·  Sillón');
    expect(within(second).getByText('Vence pronto').closest('[data-status]')).toHaveAttribute('data-status', 'DUE_SOON');
    expect(second).toHaveTextContent('Vence en 10 días');
    await waitFor(() => expect(second).toHaveTextContent('16/11/2026'));

    expect(within(section).getByRole('link', { name: copy.allLink })).toHaveAttribute('href', '/settings/equipos');
    expect(mockedDue).toHaveBeenCalledWith('tok', { limit: 5 });
  });

  it('con más avisos que filas dice cuántos se muestran', async () => {
    mockedDue.mockResolvedValue(due([OVERDUE, SOON], 7));
    renderSection();
    expect(await screen.findByText('Se muestran 2 de 7.')).toBeInTheDocument();
    expect(screen.getByText('7 equipos')).toBeInTheDocument();
  });

  it('sin avisos, una línea discreta «todo al día» (estado, no alerta)', async () => {
    mockedDue.mockResolvedValue(due([]));
    renderSection();
    const title = await screen.findByText(copy.emptyTitle);
    expect(title.closest('[role="status"]')).toHaveTextContent(copy.emptyDescription);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('list', { name: copy.listLabel })).toBeNull();
  });

  it('mientras carga, un esqueleto anunciado', () => {
    mockedDue.mockReturnValue(new Promise(() => undefined));
    renderSection();
    expect(screen.getByRole('status', { name: copy.loading })).toBeInTheDocument();
  });

  it('si la API falla, escalón 1 (SectionError) con Reintentar, y el reintento carga', async () => {
    mockedDue.mockRejectedValueOnce(new ApiError(500, 'Error interno'));
    mockedDue.mockResolvedValueOnce(due([OVERDUE]));
    const user = setupUser();
    renderSection();
    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();
    await user.click(within(alert).getByRole('button', { name: /Reintentar/ }));
    expect(await screen.findByText('Unidad dental Sillón 1')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('vuelve a pedir al cambiar la sede del selector global', async () => {
    mockedDue.mockResolvedValue(due([OVERDUE]));
    const { rerender } = renderSection('all');
    await screen.findByText('Unidad dental Sillón 1');
    rerender(<EquipmentMaintenanceSection token="tok" scopeKey="principal" />);
    await waitFor(() => expect(mockedDue).toHaveBeenCalledTimes(2));
  });
});

describe('dueWhen (DX-543)', () => {
  it.each([
    ['OVERDUE', -1, 'Venció ayer'],
    ['OVERDUE', -31, 'Venció hace 31 días'],
    ['DUE_SOON', 0, 'Vence hoy'],
    ['DUE_SOON', 1, 'Vence mañana'],
    ['DUE_SOON', 30, 'Vence en 30 días'],
  ] as const)('%s %d → %s', (status, days, text) => {
    expect(dueWhen(status, days)).toBe(text);
  });
});
