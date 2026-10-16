import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataConsentsTab } from './data-consents-tab';
import { ApiError } from '@/lib/api/client';
import {
  getPatientDataConsents,
  getPrivacyPolicies,
  recordDataConsents,
} from '@/lib/data-consents/data-consents-api';
import {
  consentRow,
  consentsFixture,
  policiesFixture,
} from '@/lib/test/data-consents';

jest.mock('../../lib/data-consents/data-consents-api', () => ({
  ...jest.requireActual('../../lib/data-consents/data-consents-api'),
  getPatientDataConsents: jest.fn(),
  getPrivacyPolicies: jest.fn(),
  recordDataConsents: jest.fn(),
}));

const mockedGet = getPatientDataConsents as jest.MockedFunction<typeof getPatientDataConsents>;
const mockedPolicies = getPrivacyPolicies as jest.MockedFunction<typeof getPrivacyPolicies>;
const mockedRecord = recordDataConsents as jest.MockedFunction<typeof recordDataConsents>;

const accepted = [
  consentRow({ id: 'g', scope: 'GENERAL', recordedAt: '2026-10-02T14:30:00.000Z' }),
  consentRow({ id: 's', scope: 'SENSITIVE_HEALTH', recordedAt: '2026-10-02T14:30:00.000Z' }),
  consentRow({ id: 'm', scope: 'MARKETING', recordedAt: '2026-10-02T14:30:00.000Z' }),
];

beforeEach(() => {
  mockedGet.mockReset();
  mockedPolicies.mockReset();
  mockedRecord.mockReset();
  mockedPolicies.mockResolvedValue(policiesFixture());
});

it('muestra el estado vigente por scope y el historial con versión y quién lo registró', async () => {
  mockedGet.mockResolvedValue(consentsFixture(accepted.slice(0, 2)));
  render(<DataConsentsTab token="tok" patientId="pat-1" />);

  expect(screen.getByRole('status', { name: /cargando/i })).toBeInTheDocument();
  const general = await screen.findByTestId('consent-status-GENERAL');
  expect(mockedGet).toHaveBeenCalledWith('tok', 'pat-1');
  expect(general).toHaveTextContent(/autorizado/i);
  expect(general).toHaveTextContent('desde el 02/10/2026 · v1');
  expect(screen.getByTestId('consent-status-MARKETING')).toHaveTextContent(/sin decisión/i);

  const table = screen.getByRole('table', { name: /historial de autorizaciones/i });
  const rows = within(table).getAllByRole('row').slice(1);
  expect(rows).toHaveLength(2);
  expect(rows[0]).toHaveTextContent('Rosa Recepción');
  expect(rows[0]).toHaveTextContent(/en la clínica/i);
});

it('estado vacío: sin filas lo dice y ofrece registrar', async () => {
  mockedGet.mockResolvedValue(consentsFixture([]));
  render(<DataConsentsTab token="tok" patientId="pat-1" />);
  expect(await screen.findByText(/aún no tiene autorizaciones/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /registrar autorización/i })).toBeInTheDocument();
});

it('sin política publicada no ofrece registrar y explica por qué', async () => {
  mockedGet.mockResolvedValue(consentsFixture([]));
  mockedPolicies.mockResolvedValue(policiesFixture(null));
  render(<DataConsentsTab token="tok" patientId="pat-1" />);
  expect(await screen.findByText(/aún no ha publicado su política/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /registrar autorización/i })).not.toBeInTheDocument();
});

it('error de carga con reintento (escalón 1)', async () => {
  const user = userEvent.setup();
  mockedGet.mockRejectedValueOnce(new Error('red'));
  mockedGet.mockResolvedValueOnce(consentsFixture(accepted));
  render(<DataConsentsTab token="tok" patientId="pat-1" />);
  expect(await screen.findByRole('alert')).toHaveTextContent(/no pudimos cargar/i);
  await user.click(screen.getByRole('button', { name: /reintentar/i }));
  expect(await screen.findByTestId('consent-status-GENERAL')).toBeInTheDocument();
});

it('revocar MARKETING pide confirmación y registra una fila granted=false', async () => {
  const user = userEvent.setup();
  mockedGet.mockResolvedValue(consentsFixture(accepted));
  const revoked = consentRow({
    id: 'm2',
    scope: 'MARKETING',
    granted: false,
    recordedAt: '2026-10-05T10:00:00.000Z',
  });
  mockedRecord.mockResolvedValue(consentsFixture([...accepted, revoked]));
  render(<DataConsentsTab token="tok" patientId="pat-1" />);

  const marketing = await screen.findByTestId('consent-status-MARKETING');
  // Solo MARKETING se revoca desde aquí.
  expect(within(screen.getByTestId('consent-status-GENERAL')).queryByRole('button')).toBeNull();
  await user.click(within(marketing).getByRole('button', { name: /revocar/i }));
  const dialog = await screen.findByRole('dialog');
  expect(dialog).toHaveTextContent(/se conserva en el historial/i);
  await user.click(within(dialog).getByRole('button', { name: /^revocar$/i }));

  expect(mockedRecord).toHaveBeenCalledWith('tok', 'pat-1', {
    policyVersionId: 'pol-1',
    decisions: [{ scope: 'MARKETING', granted: false }],
  });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByTestId('consent-status-MARKETING')).toHaveTextContent(/no autorizado/i);
  expect(
    within(screen.getByRole('table', { name: /historial/i })).getAllByRole('row'),
  ).toHaveLength(5);
});

it('registrar: solo ofrece lo no autorizado, sin premarcar, y no envía nada sin marcar', async () => {
  const user = userEvent.setup();
  mockedGet.mockResolvedValue(consentsFixture(accepted.slice(0, 1)));
  mockedRecord.mockResolvedValue(consentsFixture(accepted));
  render(<DataConsentsTab token="tok" patientId="pat-1" />);

  await user.click(await screen.findByRole('button', { name: /registrar autorización/i }));
  const dialog = await screen.findByRole('dialog');
  const boxes = within(dialog).getAllByRole('checkbox');
  expect(boxes).toHaveLength(2);
  for (const box of boxes) expect(box).not.toBeChecked();

  await user.click(within(dialog).getByRole('button', { name: /^registrar$/i }));
  expect(mockedRecord).not.toHaveBeenCalled();
  expect(within(dialog).getByRole('alert')).toHaveTextContent(/marca al menos una/i);

  await user.click(within(dialog).getByRole('checkbox', { name: /datos sensibles/i }));
  await user.click(within(dialog).getByRole('button', { name: /^registrar$/i }));
  expect(mockedRecord).toHaveBeenCalledWith('tok', 'pat-1', {
    policyVersionId: 'pol-1',
    decisions: [{ scope: 'SENSITIVE_HEALTH', granted: true }],
  });
});

it('un 409 (política cambiada) se muestra en el diálogo', async () => {
  const user = userEvent.setup();
  mockedGet.mockResolvedValue(consentsFixture(accepted));
  mockedRecord.mockRejectedValue(new ApiError(409, 'La política cambió. Recarga.'));
  render(<DataConsentsTab token="tok" patientId="pat-1" />);
  const marketing = await screen.findByTestId('consent-status-MARKETING');
  await user.click(within(marketing).getByRole('button', { name: /revocar/i }));
  const dialog = await screen.findByRole('dialog');
  await user.click(within(dialog).getByRole('button', { name: /^revocar$/i }));
  expect(await within(dialog).findByText('La política cambió. Recarga.')).toBeInTheDocument();
});

it('una fila LEGACY se marca como heredada', async () => {
  mockedGet.mockResolvedValue(
    consentsFixture([
      consentRow({
        channel: 'LEGACY',
        policyVersion: null,
        legacyPolicyVersion: 'v1',
        recordedBy: null,
      }),
    ]),
  );
  render(<DataConsentsTab token="tok" patientId="pat-1" />);
  expect(await screen.findByTestId('consent-status-GENERAL')).toHaveTextContent(
    /heredado, sin texto versionado/i,
  );
});
