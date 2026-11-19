import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BankReconciliationView, bankReconciliationCopy as copy } from './bank-reconciliation-view';
import { candidatesCopy } from './movement-candidates-modal';
import {
  autoMatchPeriod,
  getMovementCandidates,
  listBankAccounts,
  listReconciliationItems,
  matchMovement,
  unmatchMovement,
  type BankAccount,
  type ReconciliationItem,
  type ReconciliationItems,
  type ReconciliationStatus,
} from '@/lib/bank-reconciliation/bank-reconciliation-api';
import { notifyError, notifySuccess } from '@/components/errors/notify';
import { clearSessionStore } from '@/lib/session/session-store';

jest.mock('../../lib/bank-reconciliation/bank-reconciliation-api', () => ({
  ...jest.requireActual('../../lib/bank-reconciliation/bank-reconciliation-api'),
  listBankAccounts: jest.fn(),
  listReconciliationItems: jest.fn(),
  unmatchMovement: jest.fn(),
  matchMovement: jest.fn(),
  autoMatchPeriod: jest.fn(),
  getMovementCandidates: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest.fn().mockResolvedValue([jest.requireActual('../../lib/test/locations').clinicLocation()]),
}));
jest.mock('../../lib/payments/payment-methods-api', () => ({
  ...jest.requireActual('../../lib/payments/payment-methods-api'),
  listPaymentMethods: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../lib/reference/currencies-api', () => ({
  listCurrencies: jest.fn().mockResolvedValue([
    { code: 'USD', name: 'Dólar estadounidense', decimals: 2 },
    { code: 'VES', name: 'Bolívar', decimals: 2 },
  ]),
}));
jest.mock('../errors/notify', () => ({ notifyError: jest.fn(), notifySuccess: jest.fn() }));
// «Registrar abono» reutiliza el modal del estado de cuenta (con sus propios tests): aquí, lo que recibe y devuelve.
jest.mock('../payments/record-payment-modal', () => ({
  RecordPaymentModal: (props: {
    open: boolean;
    patientId: string;
    prefill?: {
      amount: number;
      currency: string;
      paymentMethodId: string | null;
      reference: string | null;
      date: string;
    };
    onRecorded: (notice: string, opts?: { paymentIds?: string[] }) => void;
  }) =>
    props.open ? (
      <div role="dialog" aria-label="Registrar abono">
        <p>{`paciente ${props.patientId}`}</p>
        <p>{`prefill ${JSON.stringify(props.prefill)}`}</p>
        <button type="button" onClick={() => props.onRecorded('Abono registrado.', { paymentIds: ['pay-new'] })}>
          Guardar abono
        </button>
      </div>
    ) : null,
}));
jest.mock('../patients/patient-search-field', () => ({
  PatientSearchField: (props: { label: string; onChange: (p: { id: string; fullName: string }) => void }) => (
    <button type="button" onClick={() => props.onChange({ id: 'pat-9', fullName: 'Luis Rondón' })}>
      {`Elegir ${props.label}`}
    </button>
  ),
}));

const mockedAccounts = listBankAccounts as jest.MockedFunction<typeof listBankAccounts>;
const mockedItems = listReconciliationItems as jest.MockedFunction<typeof listReconciliationItems>;

function account(over: Partial<BankAccount> = {}): BankAccount {
  return {
    id: 'acc-1',
    name: 'Cuenta corriente en bolívares',
    currency: 'VES',
    amountTolerance: 0,
    active: true,
    columnMapping: null,
    paymentMethods: [{ id: 'pm-mobile', name: 'Pago móvil', kind: 'DIGITAL' }],
    lastImport: {
      id: 'imp-1',
      fileSha256: 'a'.repeat(64),
      fileFormat: 'CSV',
      totalRows: 3,
      creditRows: 2,
      createdRows: 2,
      duplicateRows: 0,
      ignoredRows: 1,
      errorRows: 0,
      matchedRows: 1,
      periodFrom: '2026-10-01',
      periodTo: '2026-10-31',
      createdAt: '2026-11-01T12:00:00.000Z',
      createdBy: { id: 'u-1', name: 'Ana Admin' },
    },
    createdAt: '2026-10-01T12:00:00.000Z',
    ...over,
  };
}

const movement = {
  id: 'mov-1',
  bookedOn: '2026-10-15',
  reference: '004512',
  amount: 4500,
  currency: 'VES',
  description: 'Pago móvil recibido',
};
const payment = {
  id: 'pay-1',
  paidOn: '2026-10-15',
  amount: 4500,
  collectedAmount: 4500,
  currency: 'VES',
  reference: '004512',
  paymentMethod: { id: 'pm-mobile', name: 'Pago móvil' },
  receiptNumber: 'PRI-000012',
  hasProof: true,
  patient: { id: 'pat-1', fullName: 'María Pérez' },
  location: { id: 'loc-1', name: 'Sede principal' },
  treatmentPlanId: 'plan-1',
};

const COUNTS = { CONCILIADO: 1, IMPORTE_DISTINTO: 0, MOVIMIENTO_SIN_ABONO: 1, SIN_MOVIMIENTO: 1 };

function itemsFor(status: ReconciliationStatus): ReconciliationItem[] {
  switch (status) {
    case 'CONCILIADO':
      return [
        { status, movement, payment, match: { id: 'match-1', kind: 'AUTO', createdAt: '2026-11-01T12:00:00.000Z' } },
      ];
    case 'MOVIMIENTO_SIN_ABONO':
      return [{ status, movement: { ...movement, id: 'mov-2', reference: '009988' }, payment: null, match: null }];
    case 'SIN_MOVIMIENTO':
      return [{ status, movement: null, payment: { ...payment, id: 'pay-2' }, match: null }];
    default:
      return [];
  }
}

function response(status: ReconciliationStatus): ReconciliationItems {
  const items = itemsFor(status);
  return {
    from: '2026-10-01',
    to: '2026-10-31',
    counts: COUNTS,
    status,
    total: items.length,
    page: 1,
    pageSize: 25,
    items,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  clearSessionStore();
  mockedAccounts.mockResolvedValue([account()]);
  mockedItems.mockImplementation(async (_t, _a, q) => response(q.status));
});

describe('BankReconciliationView (DX-571)', () => {
  it('sin cuentas: explica qué es y ofrece «Crear cuenta», que abre el alta', async () => {
    mockedAccounts.mockResolvedValue([]);
    const user = userEvent.setup();
    render(<BankReconciliationView token="tok" />);
    expect(await screen.findByText(copy.emptyTitle)).toBeInTheDocument();
    expect(screen.getByText(copy.emptyHint)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: copy.createAccount }));
    expect(await screen.findByRole('dialog', { name: 'Nueva cuenta de conciliación' })).toBeInTheDocument();
    expect(mockedItems).not.toHaveBeenCalled();
  });

  it('las cuentas no cargan: error con «Reintentar» que vuelve a pedirlas', async () => {
    mockedAccounts.mockRejectedValueOnce(new Error('boom'));
    const user = userEvent.setup();
    render(<BankReconciliationView token="tok" />);
    await user.click(await screen.findByRole('button', { name: /Reintentar/ }));
    expect(await screen.findByRole('heading', { name: 'Cuenta corriente en bolívares' })).toBeInTheDocument();
    expect(mockedAccounts).toHaveBeenCalledTimes(2);
  });

  it('el período por defecto es el de la última importación; las cuatro listas con su contador', async () => {
    render(<BankReconciliationView token="tok" />);
    const table = await screen.findByRole('table', { name: 'Movimientos conciliados' });
    expect(mockedItems).toHaveBeenCalledWith('tok', 'acc-1', {
      from: '2026-10-01',
      to: '2026-10-31',
      status: 'CONCILIADO',
      page: 1,
      pageSize: 25,
    });
    expect(screen.getByRole('radio', { name: 'Conciliados 1' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Importe distinto 0' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Sin abono 1' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Sin movimiento 1' })).toBeInTheDocument();
    const row = within(table).getByText('004512').closest('tr') as HTMLElement;
    expect(row.textContent?.replace(/\s/g, ' ')).toMatch(/VES 4\.500,00|4\.500,00 VES/);
    expect(within(row).getByRole('link', { name: 'María Pérez' })).toBeInTheDocument();
    expect(within(row).getByText('PRI-000012')).toBeInTheDocument();
    expect(within(row).getByText('Automático')).toBeInTheDocument();
  });

  it('«Deshacer emparejado» cierra el emparejado y recarga', async () => {
    (unmatchMovement as jest.Mock).mockResolvedValue({ id: 'match-1' });
    const user = userEvent.setup();
    render(<BankReconciliationView token="tok" />);
    await screen.findByRole('table', { name: 'Movimientos conciliados' });
    await user.click(screen.getByRole('button', { name: /^Acciones de movimiento del/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Deshacer emparejado' }));
    await waitFor(() => expect(unmatchMovement).toHaveBeenCalledWith('tok', 'match-1'));
    expect(notifySuccess).toHaveBeenCalledWith(copy.unmatched);
    await waitFor(() => expect(mockedItems).toHaveBeenCalledTimes(2));
  });

  it('una lista vacía dice qué significa', async () => {
    const user = userEvent.setup();
    render(<BankReconciliationView token="tok" />);
    await screen.findByRole('table', { name: 'Movimientos conciliados' });
    await user.click(screen.getByRole('radio', { name: /^Importe distinto/ }));
    expect(await screen.findByText(copy.empty.IMPORTE_DISTINTO)).toBeInTheDocument();
    expect(screen.getByText(copy.emptyHints.IMPORTE_DISTINTO)).toBeInTheDocument();
  });

  it('la lista no carga: error con «Reintentar» (escalón 1) que vuelve a pedirla', async () => {
    mockedItems.mockRejectedValueOnce(new Error('boom'));
    const user = userEvent.setup();
    render(<BankReconciliationView token="tok" />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(copy.itemsError);
    await user.click(within(alert).getByRole('button', { name: /Reintentar/ }));
    expect(await screen.findByRole('table', { name: 'Movimientos conciliados' })).toBeInTheDocument();
  });

  it('«Sin abono» → «Emparejar con un abono…»: elige un candidato y empareja', async () => {
    (getMovementCandidates as jest.Mock).mockResolvedValue({
      movement: { ...movement, id: 'mov-2', reference: '009988' },
      payments: [{ ...payment, id: 'pay-7', referenceMatches: true }],
      reports: [],
    });
    (matchMovement as jest.Mock).mockResolvedValue({
      id: 'm-2',
      movementId: 'mov-2',
      paymentId: 'pay-7',
      kind: 'MANUAL',
    });
    const user = userEvent.setup();
    render(<BankReconciliationView token="tok" />);
    await screen.findByRole('table', { name: 'Movimientos conciliados' });
    await user.click(screen.getByRole('radio', { name: /^Sin abono/ }));
    const table = await screen.findByRole('table', { name: 'Movimientos sin abono' });
    expect(within(table).getByText('009988')).toBeInTheDocument();
    await user.click(within(table).getByRole('button', { name: /^Acciones de movimiento del/ }));
    expect(await screen.findByRole('menuitem', { name: 'Registrar abono' })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Emparejar con un abono…' }));
    const dialog = await screen.findByRole('dialog', { name: candidatesCopy.title });
    const option = await within(dialog).findByRole('radio', { name: /María Pérez/ });
    expect(within(dialog).getByText(candidatesCopy.sameReference)).toBeInTheDocument();
    await user.click(option);
    await user.click(within(dialog).getByRole('button', { name: candidatesCopy.submitPayment }));
    await waitFor(() => expect(matchMovement).toHaveBeenCalledWith('tok', 'mov-2', 'pay-7'));
    expect(notifySuccess).toHaveBeenCalledWith(copy.matched);
  });

  it('«Sin movimiento» ofrece «Ver comprobante» del abono', async () => {
    const user = userEvent.setup();
    render(<BankReconciliationView token="tok" />);
    await screen.findByRole('table', { name: 'Movimientos conciliados' });
    await user.click(screen.getByRole('radio', { name: /^Sin movimiento/ }));
    const table = await screen.findByRole('table', { name: 'Abonos sin movimiento' });
    await user.click(within(table).getByRole('button', { name: /^Acciones de abono de María Pérez/ }));
    expect(await screen.findByRole('menuitem', { name: 'Ver comprobante' })).toBeInTheDocument();
  });

  it('«Volver a emparejar» manda el período y dice cuántos casaron', async () => {
    (autoMatchPeriod as jest.Mock).mockResolvedValue({ id: 'acc-1', matched: 2 });
    const user = userEvent.setup();
    render(<BankReconciliationView token="tok" />);
    await screen.findByRole('table', { name: 'Movimientos conciliados' });
    await user.click(screen.getByRole('button', { name: copy.rematch }));
    await waitFor(() =>
      expect(autoMatchPeriod).toHaveBeenCalledWith('tok', 'acc-1', { from: '2026-10-01', to: '2026-10-31' }),
    );
    expect(notifySuccess).toHaveBeenCalledWith(copy.rematched(2));
    expect(notifyError).not.toHaveBeenCalled();
  });

  it('una cuenta desactivada no admite extractos y lo dice', async () => {
    mockedAccounts.mockResolvedValue([account({ active: false })]);
    render(<BankReconciliationView token="tok" />);
    expect(await screen.findByRole('button', { name: copy.upload })).toBeDisabled();
    expect(screen.getByText(copy.uploadInactive)).toBeInTheDocument();
  });

  it('«Registrar abono» de un movimiento: paciente → abono precargado → se empareja el abono creado', async () => {
    (matchMovement as jest.Mock).mockResolvedValue({
      id: 'm-3',
      movementId: 'mov-2',
      paymentId: 'pay-new',
      kind: 'MANUAL',
    });
    const user = userEvent.setup();
    render(<BankReconciliationView token="tok" />);
    await screen.findByRole('table', { name: 'Movimientos conciliados' });
    await user.click(screen.getByRole('radio', { name: /^Sin abono/ }));
    const table = await screen.findByRole('table', { name: 'Movimientos sin abono' });
    await user.click(within(table).getByRole('button', { name: /^Acciones de movimiento del/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Registrar abono' }));
    const pick = await screen.findByRole('dialog', { name: 'Registrar abono del movimiento' });
    await user.click(within(pick).getByRole('button', { name: 'Elegir Paciente' }));
    await user.click(within(pick).getByRole('button', { name: 'Continuar' }));
    const record = await screen.findByRole('dialog', { name: 'Registrar abono' });
    expect(within(record).getByText('paciente pat-9')).toBeInTheDocument();
    expect(within(record).getByText(/prefill/)).toHaveTextContent(
      'prefill {"amount":4500,"currency":"VES","paymentMethodId":"pm-mobile","reference":"009988","date":"2026-10-15"}',
    );
    await user.click(within(record).getByRole('button', { name: 'Guardar abono' }));
    await waitFor(() => expect(matchMovement).toHaveBeenCalledWith('tok', 'mov-2', 'pay-new'));
    expect(notifySuccess).toHaveBeenCalledWith(copy.recordedMatched('Abono registrado.'));
  });
});
