import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PatientAccessDialog, patientAccessCopy as copy } from './patient-access-dialog';
import { canSharePatientAccess, patientAccessMenuAction } from './patient-access-action';
import {
  createPatientAccessLink,
  listPatientAccessLinks,
  revokePatientAccessLink,
  type AccessLink,
  type CreatedAccessLink,
} from '@/lib/patient-access/patient-access-api';
import { ApiError } from '@/lib/api/client';
import { clearSessionStore } from '@/lib/session/session-store';

jest.mock('../../lib/patient-access/patient-access-api', () => ({
  ...jest.requireActual('../../lib/patient-access/patient-access-api'),
  createPatientAccessLink: jest.fn(),
  listPatientAccessLinks: jest.fn(),
  revokePatientAccessLink: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest.fn().mockResolvedValue([jest.requireActual('../../lib/test/locations').clinicLocation()]),
}));

const mockedCreate = createPatientAccessLink as jest.MockedFunction<typeof createPatientAccessLink>;
const mockedList = listPatientAccessLinks as jest.MockedFunction<typeof listPatientAccessLinks>;
const mockedRevoke = revokePatientAccessLink as jest.MockedFunction<typeof revokePatientAccessLink>;

function created(over: Partial<CreatedAccessLink> = {}): CreatedAccessLink {
  return {
    id: 'link-1',
    url: 'https://demo.dentalix.app/mi-clinica/tok123',
    expiresAt: '2026-12-02T15:00:00.000Z',
    scopes: ['APPOINTMENTS', 'PLANS', 'ACCOUNT'],
    whatsapp: { phone: '584145550101', text: 'Hola, María. Clínica Ávila te comparte tus datos: https://demo.dentalix.app/mi-clinica/tok123' },
    minor: false,
    ...over,
  };
}

function link(over: Partial<AccessLink> = {}): AccessLink {
  return {
    id: 'l1',
    scopes: ['APPOINTMENTS', 'ACCOUNT'],
    createdAt: '2026-11-10T14:00:00.000Z',
    expiresAt: '2026-11-24T14:00:00.000Z',
    lastViewedAt: null,
    lockedUntil: null,
    createdBy: { id: 'u1', fullName: 'Rita Recepción' },
    ...over,
  };
}

function renderDialog(onEditPatient = jest.fn()) {
  const onOpenChange = jest.fn();
  render(
    <PatientAccessDialog open onOpenChange={onOpenChange} token="tok" patientId="p1" onEditPatient={onEditPatient} />,
  );
  return { onOpenChange, onEditPatient };
}

beforeEach(() => {
  jest.clearAllMocks();
  clearSessionStore();
  mockedList.mockResolvedValue([]);
});

test('solo ADMIN y recepción ven «Compartir con el paciente»', () => {
  expect(canSharePatientAccess('ADMIN')).toBe(true);
  expect(canSharePatientAccess('RECEPTION')).toBe(true);
  expect(canSharePatientAccess('DENTIST')).toBe(false);
  expect(canSharePatientAccess('ASSISTANT')).toBe(false);
  expect(canSharePatientAccess(null)).toBe(false);
  expect(patientAccessMenuAction('DENTIST', jest.fn())).toBeNull();
  expect(patientAccessMenuAction('RECEPTION', jest.fn())?.label).toBe('Compartir con el paciente');
});

test('los tres apartados marcados y 14 días por defecto; crea con eso', async () => {
  const user = userEvent.setup();
  mockedCreate.mockResolvedValue(created());
  renderDialog();
  const dialog = screen.getByRole('dialog', { name: copy.title });
  expect(within(dialog).getByRole('checkbox', { name: 'Citas' })).toBeChecked();
  expect(within(dialog).getByRole('checkbox', { name: 'Presupuestos' })).toBeChecked();
  expect(within(dialog).getByRole('checkbox', { name: 'Mi cuenta' })).toBeChecked();
  expect(within(dialog).getByRole('radio', { name: '14 días' })).toBeChecked();
  await user.click(within(dialog).getByRole('button', { name: copy.submit }));
  expect(mockedCreate).toHaveBeenCalledWith('tok', 'p1', { scopes: ['APPOINTMENTS', 'PLANS', 'ACCOUNT'], ttlDays: 14 });
});

test('elige apartados y validez', async () => {
  const user = userEvent.setup();
  mockedCreate.mockResolvedValue(created({ scopes: ['ACCOUNT'] }));
  renderDialog();
  await user.click(screen.getByRole('checkbox', { name: 'Citas' }));
  await user.click(screen.getByRole('checkbox', { name: 'Presupuestos' }));
  await user.click(screen.getByRole('radio', { name: '30 días' }));
  await user.click(screen.getByRole('button', { name: copy.submit }));
  expect(mockedCreate).toHaveBeenCalledWith('tok', 'p1', { scopes: ['ACCOUNT'], ttlDays: 30 });
});

test('sin apartados no crea y lo dice', async () => {
  const user = userEvent.setup();
  renderDialog();
  for (const name of ['Citas', 'Presupuestos', 'Mi cuenta']) await user.click(screen.getByRole('checkbox', { name }));
  await user.click(screen.getByRole('button', { name: copy.submit }));
  expect(await screen.findByText(copy.scopesRequired)).toBeInTheDocument();
  expect(mockedCreate).not.toHaveBeenCalled();
});

test('la URL se ve una sola vez, con «Copiar» y «Abrir WhatsApp»', async () => {
  const user = userEvent.setup();
  mockedCreate.mockResolvedValue(created());
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  renderDialog();
  await user.click(screen.getByRole('button', { name: copy.submit }));
  const panel = await screen.findByTestId('patient-access-created');
  expect(panel).toHaveTextContent(copy.onlyOnce);
  expect(within(panel).getByLabelText(copy.linkLabel)).toHaveValue('https://demo.dentalix.app/mi-clinica/tok123');
  const wa = within(panel).getByRole('link', { name: /Abrir WhatsApp/ });
  expect(wa.getAttribute('href')).toBe(
    `https://wa.me/584145550101?text=${encodeURIComponent(created().whatsapp!.text)}`,
  );
  await user.click(within(panel).getByRole('button', { name: /Copiar/ }));
  expect(writeText).toHaveBeenCalledWith('https://demo.dentalix.app/mi-clinica/tok123');
  expect(await screen.findByText(copy.copied)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: copy.submit })).not.toBeInTheDocument();
  expect(screen.queryByTestId('patient-access-minor')).not.toBeInTheDocument();
  // La lista se vuelve a pedir tras crear.
  await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(2));
});

test('sin teléfono válido: solo copiar, con el aviso; menor: aviso del responsable', async () => {
  const user = userEvent.setup();
  mockedCreate.mockResolvedValue(created({ whatsapp: null, minor: true }));
  renderDialog();
  await user.click(screen.getByRole('button', { name: copy.submit }));
  const panel = await screen.findByTestId('patient-access-created');
  expect(within(panel).queryByRole('link', { name: /WhatsApp/ })).not.toBeInTheDocument();
  expect(screen.getByTestId('patient-access-no-phone')).toHaveTextContent(copy.noPhone);
  expect(screen.getByTestId('patient-access-minor')).toHaveTextContent(copy.minor);
});

test('409 sin fecha de nacimiento: el mensaje de la API y «Editar la ficha»', async () => {
  const user = userEvent.setup();
  const message =
    'El paciente no tiene fecha de nacimiento registrada: añádela en su ficha antes de compartir el enlace (es lo que se le pedirá para abrirlo).';
  mockedCreate.mockRejectedValue(new ApiError(409, message, { messages: [message] }));
  const { onOpenChange, onEditPatient } = renderDialog();
  await user.click(screen.getByRole('button', { name: copy.submit }));
  expect(await screen.findByText(message)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: copy.editPatient }));
  expect(onOpenChange).toHaveBeenCalledWith(false);
  expect(onEditPatient).toHaveBeenCalled();
});

test('lista vacía, y error con reintento', async () => {
  const user = userEvent.setup();
  mockedList.mockRejectedValueOnce(new Error('red')).mockResolvedValueOnce([]);
  renderDialog();
  expect(await screen.findByText(copy.listError)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /Reintentar/ }));
  expect(await screen.findByText(copy.listEmpty)).toBeInTheDocument();
});

test('enlaces activos: apartados, creador, caducidad, «Nunca abierto», bloqueo; revocar con confirmación', async () => {
  const user = userEvent.setup();
  mockedList.mockResolvedValue([
    link(),
    link({ id: 'l2', scopes: ['PLANS'], lastViewedAt: '2026-11-12T15:00:00.000Z', lockedUntil: '2999-01-01T00:00:00.000Z', createdBy: { id: 'u2', fullName: null } }),
  ]);
  mockedRevoke.mockResolvedValue(undefined);
  renderDialog();
  const rows = await screen.findAllByTestId('patient-access-link');
  expect(rows).toHaveLength(2);
  expect(rows[0]).toHaveTextContent('Citas · Mi cuenta');
  expect(rows[0]).toHaveTextContent('Creado por Rita Recepción');
  expect(rows[0]).toHaveTextContent(copy.neverOpened);
  expect(rows[0]).toHaveTextContent('Caduca el');
  expect(rows[1]).toHaveTextContent('Último acceso:');
  expect(rows[1]).toHaveTextContent('Bloqueado hasta');
  expect(rows[1]).toHaveTextContent(copy.formerMember);

  await user.click(within(rows[0]).getByRole('button', { name: /Revocar el enlace de Citas · Mi cuenta/ }));
  const confirm = await screen.findByRole('dialog', { name: copy.revokeTitle });
  await user.click(within(confirm).getByRole('button', { name: copy.revokeConfirm }));
  expect(mockedRevoke).toHaveBeenCalledWith('tok', 'p1', 'l1');
  await waitFor(() => expect(screen.getAllByTestId('patient-access-link')).toHaveLength(1));
});

test('si revocar falla, el diálogo de confirmación sigue con el motivo', async () => {
  const user = userEvent.setup();
  mockedList.mockResolvedValue([link()]);
  mockedRevoke.mockRejectedValue(new ApiError(500, 'boom'));
  renderDialog();
  await user.click(await screen.findByRole('button', { name: /Revocar el enlace/ }));
  const confirm = await screen.findByRole('dialog', { name: copy.revokeTitle });
  await user.click(within(confirm).getByRole('button', { name: copy.revokeConfirm }));
  expect(await within(confirm).findByRole('alert')).toBeInTheDocument();
  expect(screen.getAllByTestId('patient-access-link')).toHaveLength(1);
});
