import { render, screen, waitFor, within } from '@testing-library/react';
import { RadiologyManager, radiologyManagerCopy as copy } from './radiology-manager';
import {
  listRadiologyRecords,
  voidRadiologyRecord,
  type RadiologyRecord,
} from '@/lib/radiology/radiology-api';
import { listLocations } from '@/lib/locations/locations-api';
import { ApiError } from '@/lib/api/client';
import { clinicLocation } from '@/lib/test/locations';
import { radiologyRecordFixture } from '@/lib/test/radiology';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/radiology/radiology-api', () => ({
  ...jest.requireActual('../../lib/radiology/radiology-api'),
  listRadiologyRecords: jest.fn(),
  voidRadiologyRecord: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
jest.mock('../../lib/equipment/equipment-api', () => ({
  ...jest.requireActual('../../lib/equipment/equipment-api'),
  listEquipment: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 }),
}));
jest.mock('../../lib/staff/staff-api', () => ({
  ...jest.requireActual('../../lib/staff/staff-api'),
  listStaff: jest.fn().mockResolvedValue([]),
}));

const mockedList = jest.mocked(listRadiologyRecords);
const mockedVoid = jest.mocked(voidRadiologyRecord);
const norte = clinicLocation({ id: 'norte', name: 'Sede Norte', locale: 'es-VE', hourCycle: 'h23' });
const sur = clinicLocation({ id: 'sur', name: 'Sede Sur', locale: 'es-VE', hourCycle: 'h23' });

function page(items: RadiologyRecord[]) {
  return { items, total: items.length, page: 1, pageSize: 50 };
}

const LICENSE = radiologyRecordFixture({
  id: 'lic',
  equipmentId: 'rx',
  equipmentName: 'Rayos X periapical',
  expiresOn: '2026-12-21',
  status: 'DUE_SOON',
  officerName: 'Dra. Encargada',
});
const QUALITY = radiologyRecordFixture({
  id: 'qc',
  kind: 'QUALITY_CONTROL',
  category: null,
  reference: null,
  issuer: 'Física Médica',
  expiresOn: '2026-10-25',
  status: 'OVERDUE',
});

function renderManager({
  canRead = true,
  canManage = true,
  initialLocationId = 'norte' as string | null,
} = {}) {
  return render(
    <RadiologyManager
      token="tok"
      canRead={canRead}
      canManage={canManage}
      locations={[norte, sur]}
      initialLocationId={initialLocationId}
    />,
  );
}

describe('RadiologyManager (DX-544)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(listLocations).mockResolvedValue([norte, sur]);
  });

  it('lista los documentos de la sede con su vencimiento en la fecha de la sede y su estado', async () => {
    mockedList.mockResolvedValue(page([QUALITY, LICENSE]));
    renderManager();
    const table = await screen.findByRole('table', { name: copy.tableLabel });
    // La sede viaja en X-Location-Id (apiFetch): la llamada no la repite.
    expect(mockedList).toHaveBeenCalledWith('tok', { status: 'LIVE', page: 1, pageSize: 50 });
    expect(within(table).queryByRole('columnheader', { name: copy.colLocation })).toBeNull();
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Control de calidad');
    expect(rows[1]).toHaveTextContent(copy.wholeSede);
    expect(within(rows[1]).getByText('Vencido')).toBeInTheDocument();
    expect(rows[2]).toHaveTextContent('Licencia · Cat. I');
    expect(rows[2]).toHaveTextContent('Rayos X periapical');
    expect(rows[2]).toHaveTextContent('Dra. Encargada');
    expect(within(rows[2]).getByText('Vence pronto')).toBeInTheDocument();
    await waitFor(() => expect(within(rows[2]).getByText('21/12/2026')).toBeInTheDocument());
  });

  it('con «Todas las sedes» sale la columna Sede', async () => {
    mockedList.mockResolvedValue(page([radiologyRecordFixture({ id: 'x', locationId: 'sur', locationName: 'Sede Sur' })]));
    renderManager({ initialLocationId: null });
    const table = await screen.findByRole('table', { name: copy.tableLabel });
    expect(within(table).getByRole('columnheader', { name: copy.colLocation })).toBeInTheDocument();
    expect(within(table).getAllByText('Sede Sur').length).toBeGreaterThan(0);
  });

  it('vacío: invita a registrar; filtrado por anulados, sin botón', async () => {
    mockedList.mockResolvedValue(page([]));
    renderManager();
    expect(await screen.findByText(copy.empty)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.createRecord })).toBeInTheDocument();
    await setupUser().selectOptions(screen.getByRole('combobox', { name: copy.status }), 'VOIDED');
    expect(await screen.findByText(copy.emptyFiltered)).toBeInTheDocument();
    expect(mockedList).toHaveBeenLastCalledWith('tok', { status: 'VOIDED', page: 1, pageSize: 50 });
  });

  it('error: escalón 1 con Reintentar', async () => {
    mockedList.mockRejectedValueOnce(new ApiError(500, 'boom')).mockResolvedValue(page([LICENSE]));
    renderManager();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await setupUser().click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('table', { name: copy.tableLabel })).toBeInTheDocument();
  });

  it('anular pide motivo y recarga la lista', async () => {
    mockedList.mockResolvedValue(page([LICENSE]));
    mockedVoid.mockResolvedValue({ ...LICENSE, status: null, voidedAt: '2026-11-06T00:00:00.000Z', voidReason: 'x' });
    renderManager();
    const user = setupUser();
    const table = await screen.findByRole('table', { name: copy.tableLabel });
    await user.click(within(table).getByRole('button', { name: /Acciones/ }));
    await user.click(await screen.findByRole('menuitem', { name: copy.void }));
    const dialog = await screen.findByRole('dialog', { name: /¿Anular «Licencia · Cat. I LIC-0456»\?/ });
    await user.click(within(dialog).getByRole('button', { name: copy.voidSubmit }));
    expect(await within(dialog).findByText('Escribe el motivo (de 3 a 500 caracteres).')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Motivo')).toHaveFocus();
    await user.type(within(dialog).getByLabelText('Motivo'), 'Registrada dos veces');
    await user.click(within(dialog).getByRole('button', { name: copy.voidSubmit }));
    await waitFor(() => expect(mockedVoid).toHaveBeenCalledWith('tok', 'lic', 'Registrada dos veces'));
    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(2));
  });

  it('el odontólogo lo lee sin acciones ni botón de alta', async () => {
    mockedList.mockResolvedValue(page([LICENSE]));
    renderManager({ canManage: false });
    const table = await screen.findByRole('table', { name: copy.tableLabel });
    expect(screen.queryByRole('button', { name: copy.newRecord })).toBeNull();
    expect(within(table).queryByRole('button', { name: /Acciones/ })).toBeNull();
    expect(screen.getByText(copy.readOnly)).toBeInTheDocument();
  });

  it('otro rol ve el aviso y no pide nada', () => {
    renderManager({ canRead: false, canManage: false });
    expect(screen.getByRole('status')).toHaveTextContent(copy.forbiddenTitle);
    expect(mockedList).not.toHaveBeenCalled();
  });
});
