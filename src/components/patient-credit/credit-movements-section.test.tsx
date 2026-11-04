import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreditMovementsSection } from './credit-movements-section';
import { getCreditMovements, type PatientCreditMovements } from '@/lib/patient-credit/patient-credit-api';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';
import { refundFixture } from '@/lib/test/credit-refund';

jest.mock('../../lib/patient-credit/patient-credit-api', () => ({
  ...jest.requireActual('../../lib/patient-credit/patient-credit-api'),
  getCreditMovements: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));

const mockedMovements = getCreditMovements as jest.MockedFunction<typeof getCreditMovements>;
const mockedLocations = listLocations as jest.MockedFunction<typeof listLocations>;

const planName = (id: string) => `Plan ${id}`;
const nbsp = (text: string | null | undefined) => (text ?? '').replace(/\s/g, ' ');

const transfer: PatientCreditMovements['transfers'][number] = {
  id: 't-1',
  patientId: 'pat-1',
  locationId: 'loc-1',
  sourcePlanId: 'origen',
  targetPlanId: 'destino',
  currency: 'VES',
  amount: 200000,
  reason: 'Se aplica al plan nuevo',
  createdById: 'u-1',
  createdByName: 'Rita Recepción',
  createdAt: '2026-10-31T15:30:00.000Z',
};

const refund = refundFixture({
  id: 'r-1',
  number: 'DEV-NOR-000007',
  treatmentPlanId: 'origen',
  currency: 'VES',
  amount: 40000,
  createdAt: '2026-11-01T13:00:00.000Z',
});

function renderSection(extra: { reloadKey?: number; onOpenReceipt?: jest.Mock } = {}) {
  const onOpenReceipt = extra.onOpenReceipt ?? jest.fn();
  render(
    <CreditMovementsSection
      token="tok"
      patientId="pat-1"
      planName={planName}
      reloadKey={extra.reloadKey ?? 0}
      onOpenReceipt={onOpenReceipt}
    />,
  );
  return { onOpenReceipt };
}

beforeEach(() => {
  mockedMovements.mockReset();
  mockedLocations.mockResolvedValue([clinicLocation()]);
  window.localStorage.clear();
  window.localStorage.setItem('dentalix.activeLocationId', 'loc-1');
});

it('carga: un esqueleto con nombre accesible mientras llega el historial', async () => {
  mockedMovements.mockReturnValue(new Promise(() => undefined));
  renderSection();
  expect(screen.getByRole('heading', { name: 'Traspasos y devoluciones' })).toBeInTheDocument();
  expect(screen.getByRole('status', { name: 'Cargando' })).toBeInTheDocument();
});

it('vacío: dice que aún no hay traspasos ni devoluciones, sin fingir una tabla', async () => {
  mockedMovements.mockResolvedValue({ transfers: [], refunds: [] });
  renderSection();
  expect(await screen.findByText('Aún no hay traspasos ni devoluciones')).toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});

it('error: escalón 1 con reintento que vuelve a pedir el historial', async () => {
  const user = userEvent.setup();
  mockedMovements.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ transfers: [transfer], refunds: [] });
  renderSection();
  const alert = await screen.findByRole('alert');
  expect(within(alert).getByText(/No pudimos cargar los traspasos y devoluciones/)).toBeInTheDocument();
  await user.click(within(alert).getByRole('button', { name: 'Reintentar' }));
  expect(await screen.findByRole('table', { name: 'Traspasos y devoluciones' })).toBeInTheDocument();
  expect(mockedMovements).toHaveBeenCalledTimes(2);
});

it('lista traspasos y devoluciones con fecha de la sede, importe con código ISO, origen/destino, motivo y quién', async () => {
  mockedMovements.mockResolvedValue({ transfers: [transfer], refunds: [refund] });
  renderSection();
  const table = await screen.findByRole('table', { name: 'Traspasos y devoluciones' });
  const rows = within(table).getAllByRole('row').slice(1);
  expect(rows).toHaveLength(2);

  // Lo más reciente primero: la devolución del 1 de noviembre (09:00 en Caracas, 12 h).
  const [refundRow, transferRow] = rows;
  expect(within(refundRow).getByText('Devolución')).toBeInTheDocument();
  expect(nbsp(refundRow.textContent)).toContain('VES 40.000,00');
  expect(refundRow.textContent).toContain('Plan origen');
  expect(refundRow.textContent).toContain('Paciente');
  expect(refundRow.textContent).toContain('El paciente se muda de ciudad');
  expect(refundRow.textContent).toContain('Rita Recepción');
  expect(refundRow.textContent).toContain('DEV-NOR-000007');
  expect(refundRow.textContent).toMatch(/01\/11\/2026/);

  expect(within(transferRow).getByText('Traspaso')).toBeInTheDocument();
  expect(nbsp(transferRow.textContent)).toContain('VES 200.000,00');
  expect(transferRow.textContent).toContain('Plan origen');
  expect(transferRow.textContent).toContain('Plan destino');
  expect(transferRow.textContent).toContain('Se aplica al plan nuevo');
  expect(transferRow.textContent).toContain('Rita Recepción');
  // 31/10/2026 11:30 en Caracas (UTC−4), no la hora del entorno.
  expect(transferRow.textContent).toMatch(/31\/10\/2026/);
});

it('traspaso sin motivo ni nombre: guiones, sin inventar', async () => {
  mockedMovements.mockResolvedValue({
    transfers: [{ ...transfer, reason: null, createdByName: null }],
    refunds: [],
  });
  renderSection();
  const table = await screen.findByRole('table');
  const row = within(table).getAllByRole('row')[1];
  expect(within(row).getAllByText('—').length).toBeGreaterThanOrEqual(2);
});

it('cada devolución se reimprime desde su «⋯»; un traspaso no tiene comprobante', async () => {
  const user = userEvent.setup();
  mockedMovements.mockResolvedValue({ transfers: [transfer], refunds: [refund] });
  const { onOpenReceipt } = renderSection();
  const table = await screen.findByRole('table');
  const [refundRow, transferRow] = within(table).getAllByRole('row').slice(1);
  expect(within(transferRow).queryByRole('button', { name: /^Acciones de/ })).not.toBeInTheDocument();
  await user.click(within(refundRow).getByRole('button', { name: /^Acciones de/ }));
  await user.click(await screen.findByRole('menuitem', { name: 'Reimprimir comprobante' }));
  expect(onOpenReceipt).toHaveBeenCalledWith(expect.objectContaining({ id: 'r-1', number: 'DEV-NOR-000007' }));
});

it('se vuelve a pedir cuando cambia reloadKey (tras un traspaso o una devolución)', async () => {
  mockedMovements.mockResolvedValue({ transfers: [], refunds: [] });
  const { rerender } = render(
    <CreditMovementsSection token="tok" patientId="pat-1" planName={planName} reloadKey={0} onOpenReceipt={jest.fn()} />,
  );
  await screen.findByText('Aún no hay traspasos ni devoluciones');
  rerender(
    <CreditMovementsSection token="tok" patientId="pat-1" planName={planName} reloadKey={1} onOpenReceipt={jest.fn()} />,
  );
  await waitFor(() => expect(mockedMovements).toHaveBeenCalledTimes(2));
});
