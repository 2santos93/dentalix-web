import { render, screen, waitFor, within } from '@testing-library/react';
import { RadiologyFormModal, radiologyFormCopy as copy } from './radiology-form-modal';
import { createRadiologyRecord, updateRadiologyRecord } from '@/lib/radiology/radiology-api';
import { listEquipment } from '@/lib/equipment/equipment-api';
import { listStaff } from '@/lib/staff/staff-api';
import { listLocations } from '@/lib/locations/locations-api';
import { ApiError } from '@/lib/api/client';
import { clinicLocation } from '@/lib/test/locations';
import { equipmentFixture } from '@/lib/test/equipment';
import { radiologyRecordFixture } from '@/lib/test/radiology';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/radiology/radiology-api', () => ({
  ...jest.requireActual('../../lib/radiology/radiology-api'),
  createRadiologyRecord: jest.fn(),
  updateRadiologyRecord: jest.fn(),
}));
jest.mock('../../lib/equipment/equipment-api', () => ({
  ...jest.requireActual('../../lib/equipment/equipment-api'),
  listEquipment: jest.fn(),
}));
jest.mock('../../lib/staff/staff-api', () => ({
  ...jest.requireActual('../../lib/staff/staff-api'),
  listStaff: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));

const mockedCreate = jest.mocked(createRadiologyRecord);
const mockedUpdate = jest.mocked(updateRadiologyRecord);
const norte = clinicLocation({ id: 'norte', name: 'Sede Norte', locale: 'es-VE', hourCycle: 'h23' });
const XRAY = equipmentFixture({ id: 'rx', name: 'Rayos X periapical', category: 'XRAY' });
const AUTOCLAVE = equipmentFixture({ id: 'ac', name: 'Autoclave', category: 'AUTOCLAVE' });

async function typeDate(label: string, digits: string) {
  const user = setupUser();
  const group = screen.getByRole('group', { name: label });
  await user.click(within(group).getAllByRole('spinbutton')[0]);
  await user.keyboard(digits);
}

function renderModal(record: Parameters<typeof RadiologyFormModal>[0]['record'] = null, onSaved = jest.fn()) {
  render(
    <RadiologyFormModal
      open
      onOpenChange={jest.fn()}
      token="tok"
      locations={[norte]}
      defaultLocationId="norte"
      record={record}
      onSaved={onSaved}
    />,
  );
  return onSaved;
}

describe('RadiologyFormModal (DX-544)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(listLocations).mockResolvedValue([norte]);
    jest.mocked(listEquipment).mockResolvedValue({ items: [XRAY, AUTOCLAVE], total: 2, page: 1, pageSize: 100 });
    jest
      .mocked(listStaff)
      .mockResolvedValue([{ userId: 'u-ana', fullName: 'Dra. Ana', email: 'a@x', role: 'DENTIST', locationIds: null }]);
  });

  it('alta de una licencia: solo ofrece los equipos de rayos X, propone el vencimiento y lo deja a la API', async () => {
    mockedCreate.mockResolvedValue(radiologyRecordFixture({ id: 'new' }));
    const onSaved = renderModal();
    const user = setupUser();
    const equipment = screen.getByLabelText(copy.equipment);
    await waitFor(() => expect(equipment).toBeEnabled());
    expect(within(equipment).getAllByRole('option').map((o) => o.textContent)).toEqual([
      copy.equipmentNone,
      'Rayos X periapical',
    ]);
    await user.selectOptions(equipment, 'rx');
    await user.selectOptions(screen.getByLabelText(copy.category), 'II');
    await user.type(screen.getByLabelText(copy.referenceLicense), 'LIC-0456');
    await user.type(screen.getByLabelText(copy.issuerLicense), 'Autoridad sanitaria');
    await typeDate(copy.issuedOn, '10012026');
    // Categoría II: 4 años.
    expect(await screen.findByText(copy.expiresProposed('10/01/2030'))).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(copy.officer), 'u-ana');
    await user.click(screen.getByRole('button', { name: copy.create }));
    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith('tok', {
        kind: 'LICENSE',
        locationId: 'norte',
        equipmentId: 'rx',
        category: 'II',
        reference: 'LIC-0456',
        issuer: 'Autoridad sanitaria',
        issuedOn: '2026-01-10',
        expiresOn: null,
        officerUserId: 'u-ana',
        officerName: null,
        notes: null,
      }),
    );
    expect(onSaved).toHaveBeenCalled();
  });

  it('valida antes de enviar y lleva el foco al primer error', async () => {
    renderModal();
    const user = setupUser();
    await user.click(screen.getByRole('button', { name: copy.create }));
    expect(await screen.findByText(copy.categoryRequired)).toBeInTheDocument();
    expect(screen.getByText(copy.referenceRequired)).toBeInTheDocument();
    expect(screen.getByText(copy.issuerRequired)).toBeInTheDocument();
    expect(screen.getByText(copy.issuedRequired)).toBeInTheDocument();
    expect(screen.getByLabelText(copy.category)).toHaveFocus();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('control de calidad: sin categoría, número opcional, encargado escrito a mano', async () => {
    mockedCreate.mockResolvedValue(radiologyRecordFixture({ id: 'qc', kind: 'QUALITY_CONTROL', category: null }));
    renderModal();
    const user = setupUser();
    await user.selectOptions(screen.getByLabelText(copy.kind), 'QUALITY_CONTROL');
    expect(screen.queryByLabelText(copy.category)).toBeNull();
    await user.type(screen.getByLabelText(copy.issuerQuality), 'Física Médica');
    await typeDate(copy.issuedOn, '10012026');
    expect(await screen.findByText(copy.expiresProposed('10/01/2028'))).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(copy.officer)).toBeEnabled());
    await user.selectOptions(screen.getByLabelText(copy.officer), '__other__');
    await user.click(screen.getByRole('button', { name: copy.create }));
    expect(await screen.findByText(copy.officerNameRequired)).toBeInTheDocument();
    expect(screen.getByLabelText(copy.officerName)).toHaveFocus();
    await user.type(screen.getByLabelText(copy.officerName), 'Ing. Pérez');
    await user.click(screen.getByRole('button', { name: copy.create }));
    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith(
        'tok',
        expect.objectContaining({
          kind: 'QUALITY_CONTROL',
          category: null,
          reference: null,
          officerUserId: null,
          officerName: 'Ing. Pérez',
        }),
      ),
    );
  });

  it('edición: el vencimiento calculado queda vacío (se recalcula) y el escrito se conserva', async () => {
    mockedUpdate.mockResolvedValue(radiologyRecordFixture({ id: 'lic' }));
    // 10/03/2022 + 5 años = el calculado.
    renderModal(radiologyRecordFixture({ id: 'lic' }));
    const user = setupUser();
    expect(screen.queryByLabelText(copy.kind)).toBeNull();
    expect(screen.getByRole('dialog', { name: copy.editTitle('LICENSE') })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: copy.save }));
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith('tok', 'lic', expect.objectContaining({ expiresOn: null })),
    );
    expect(mockedUpdate.mock.calls[0][2]).not.toHaveProperty('locationId');
  });

  it('edición con vencimiento propio: lo manda tal cual', async () => {
    mockedUpdate.mockResolvedValue(radiologyRecordFixture({ id: 'lic' }));
    renderModal(radiologyRecordFixture({ id: 'lic', expiresOn: '2026-12-31' }));
    await setupUser().click(screen.getByRole('button', { name: copy.save }));
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith('tok', 'lic', expect.objectContaining({ expiresOn: '2026-12-31' })),
    );
  });

  it('el rechazo de la API sale en el formulario', async () => {
    mockedUpdate.mockRejectedValue(new ApiError(400, 'El equipo no es de la sede del documento.'));
    renderModal(radiologyRecordFixture({ id: 'lic' }));
    await setupUser().click(screen.getByRole('button', { name: copy.save }));
    expect(await screen.findByText('El equipo no es de la sede del documento.')).toBeInTheDocument();
  });

  it('si no cargan los equipos, el campo ofrece Reintentar', async () => {
    jest.mocked(listEquipment).mockRejectedValueOnce(new Error('network'));
    renderModal();
    expect(await screen.findByText(copy.equipmentError)).toBeInTheDocument();
    await setupUser().click(screen.getByRole('button', { name: /Reintentar/ }));
    await waitFor(() => expect(screen.getByLabelText(copy.equipment)).toBeEnabled());
  });
});
