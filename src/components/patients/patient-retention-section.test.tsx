import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PatientRetentionSection, formatCivilDate } from './patient-retention-section';
import {
  archivePatient,
  partiallySuppressPatient,
  setRetentionExtension,
  type Patient,
} from '@/lib/patients/patients-api';
import { ApiError } from '@/lib/api/api-error';

jest.mock('../../lib/patients/patients-api', () => ({
  ...jest.requireActual('../../lib/patients/patients-api'),
  archivePatient: jest.fn(),
  setRetentionExtension: jest.fn(),
  partiallySuppressPatient: jest.fn(),
}));

const mockedArchive = archivePatient as jest.MockedFunction<typeof archivePatient>;
const mockedSetRetention = setRetentionExtension as jest.MockedFunction<
  typeof setRetentionExtension
>;
const mockedSuppress = partiallySuppressPatient as jest.MockedFunction<
  typeof partiallySuppressPatient
>;

const RETENTION_MESSAGE =
  'La historia clínica de este paciente está en retención legal hasta el 28/02/2039 (15 años desde la última atención): no se puede archivar ni borrar. Si necesitas retirar sus datos de contacto, usa la supresión parcial.';

function patient(overrides: Partial<Patient> = {}): Patient {
  return {
    id: 'p1',
    tenantId: 't1',
    firstName: 'Ana',
    lastName: 'Gómez',
    docType: 'NATIONAL_ID',
    docNumber: '1002',
    birthDate: null,
    sex: 'F',
    phone: '3001112233',
    email: 'ana@example.com',
    address: null,
    notes: null,
    createdById: null,
    lastAttentionAt: '2024-02-29T15:00:00.000Z',
    retentionExtended: 'NONE',
    retentionUntil: '2039-02-28',
    underRetention: true,
    partiallySuppressedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderSection(
  p: Patient,
  { isAdmin = true }: { isAdmin?: boolean } = {},
) {
  const onUpdated = jest.fn();
  const onArchived = jest.fn();
  render(
    <PatientRetentionSection
      patient={p}
      token="tok"
      isAdmin={isAdmin}
      onUpdated={onUpdated}
      onArchived={onArchived}
    />,
  );
  return { onUpdated, onArchived };
}

beforeEach(() => jest.resetAllMocks());

test('formatCivilDate no pasa por la zona del navegador', () => {
  expect(formatCivilDate('2039-02-28')).toBe('28/02/2039');
  expect(formatCivilDate('2026-10-16T23:30:00.000Z')).toBe('16/10/2026');
});

test('muestra el badge con la fecha hasta la que se conserva', () => {
  renderSection(patient(), { isAdmin: false });
  expect(screen.getByText('Historia en retención legal hasta 28/02/2039')).toBeInTheDocument();
  // Sin ADMIN, sin controles.
  expect(screen.queryByRole('button', { name: /archivar/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /cambiar retención/i })).not.toBeInTheDocument();
});

test('plazo doble: el aviso cita 30 años, no 15', () => {
  renderSection(patient({ retentionExtended: 'DOUBLE', retentionUntil: '2054-02-28' }), {
    isAdmin: false,
  });
  expect(screen.getByText('Historia en retención legal hasta 28/02/2054')).toBeInTheDocument();
  expect(screen.getByText(/Plazo doble: se conserva 30 años/)).toBeInTheDocument();
  expect(screen.queryByText(/15 años/)).not.toBeInTheDocument();
});

test('retención permanente, vencida y sin atenciones', () => {
  const { unmount } = render(
    <PatientRetentionSection
      patient={patient({ retentionExtended: 'PERMANENT', retentionUntil: null })}
      token="tok"
      isAdmin={false}
      onUpdated={jest.fn()}
      onArchived={jest.fn()}
    />,
  );
  expect(screen.getByText('Historia en retención legal permanente')).toBeInTheDocument();
  expect(
    screen.getByText('Se conserva sin fecha de fin: el paciente no se puede archivar.'),
  ).toBeInTheDocument();
  expect(screen.queryByText(/15 años/)).not.toBeInTheDocument();
  unmount();
  renderSection(patient({ retentionUntil: '2020-01-01', underRetention: false }), {
    isAdmin: false,
  });
  expect(screen.getByText('Retención legal vencida el 01/01/2020')).toBeInTheDocument();
});

test('sin atenciones clínicas: no hay retención ni botón de supresión', () => {
  renderSection(
    patient({ lastAttentionAt: null, retentionUntil: null, underRetention: false }),
  );
  expect(screen.getByText('Sin atenciones clínicas: sin retención legal')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Supresión parcial' })).not.toBeInTheDocument();
});

test('archivar con la HC en retención: el 409 se muestra en español en el modal', async () => {
  const user = userEvent.setup();
  mockedArchive.mockRejectedValue(new ApiError(409, RETENTION_MESSAGE));
  const { onArchived } = renderSection(patient());
  await user.click(screen.getByRole('button', { name: /archivar paciente/i }));
  const dialog = await screen.findByRole('dialog');
  await user.click(within(dialog).getByRole('button', { name: 'Archivar' }));
  expect(await within(dialog).findByText(RETENTION_MESSAGE)).toBeInTheDocument();
  expect(mockedArchive).toHaveBeenCalledWith('tok', 'p1');
  expect(onArchived).not.toHaveBeenCalled();
});

test('archivar con citas abiertas: el 409 de la API se muestra en el modal', async () => {
  const user = userEvent.setup();
  const message =
    'Este paciente tiene 1 cita programada o confirmada: cancélala o márcala como atendida o no asistida antes de archivarlo.';
  mockedArchive.mockRejectedValue(new ApiError(409, message));
  const { onArchived } = renderSection(
    patient({ lastAttentionAt: null, retentionUntil: null, underRetention: false }),
  );
  await user.click(screen.getByRole('button', { name: /archivar paciente/i }));
  const dialog = await screen.findByRole('dialog');
  await user.click(within(dialog).getByRole('button', { name: 'Archivar' }));
  expect(await within(dialog).findByText(message)).toBeInTheDocument();
  expect(onArchived).not.toHaveBeenCalled();
});

test('archivar sin retención cierra el modal y avisa al padre', async () => {
  const user = userEvent.setup();
  mockedArchive.mockResolvedValue(undefined);
  const { onArchived } = renderSection(
    patient({ lastAttentionAt: null, retentionUntil: null, underRetention: false }),
  );
  await user.click(screen.getByRole('button', { name: /archivar paciente/i }));
  await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Archivar' }));
  await waitFor(() => expect(onArchived).toHaveBeenCalled());
});

test('cambiar la retención exige motivo y envía el valor elegido', async () => {
  const user = userEvent.setup();
  const updated = patient({ retentionExtended: 'PERMANENT', retentionUntil: null });
  let resolve: (p: Patient) => void = () => undefined;
  mockedSetRetention.mockReturnValue(new Promise((r) => (resolve = r)));
  const { onUpdated } = renderSection(patient());
  await user.click(screen.getByRole('button', { name: 'Cambiar retención' }));
  const dialog = await screen.findByRole('dialog');
  await user.selectOptions(within(dialog).getByLabelText('Plazo'), 'PERMANENT');
  await user.type(within(dialog).getByLabelText('Motivo'), 'corto');
  await user.click(within(dialog).getByRole('button', { name: 'Guardar retención' }));
  expect(
    within(dialog).getByText('El motivo debe tener al menos 10 caracteres.'),
  ).toBeInTheDocument();
  expect(mockedSetRetention).not.toHaveBeenCalled();

  await user.type(within(dialog).getByLabelText('Motivo'), ' víctima del conflicto');
  await user.click(within(dialog).getByRole('button', { name: 'Guardar retención' }));
  expect(mockedSetRetention).toHaveBeenCalledWith('tok', 'p1', {
    retentionExtended: 'PERMANENT',
    reason: 'corto víctima del conflicto',
  });
  // Estado de carga: el envío queda deshabilitado mientras viaja.
  expect(within(dialog).getByRole('button', { name: /guardar retención/i })).toBeDisabled();
  resolve(updated);
  await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(updated));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

test('supresión parcial: error de la API visible y el modal sigue abierto', async () => {
  const user = userEvent.setup();
  mockedSuppress.mockRejectedValue(new ApiError(403, 'Forbidden'));
  renderSection(patient());
  await user.click(screen.getByRole('button', { name: 'Supresión parcial' }));
  const dialog = await screen.findByRole('dialog');
  await user.type(within(dialog).getByLabelText('Motivo'), 'Reclamo del titular Ley 1581');
  await user.click(within(dialog).getByRole('button', { name: 'Suprimir datos' }));
  expect(await within(dialog).findByText(/no tienes permiso/i)).toBeInTheDocument();
  expect(mockedSuppress).toHaveBeenCalledWith('tok', 'p1', {
    reason: 'Reclamo del titular Ley 1581',
  });
});
