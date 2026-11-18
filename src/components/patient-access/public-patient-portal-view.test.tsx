import type { AccountStatement } from '@/lib/account-statement/account-statement-api';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PublicPatientPortalView, publicPortalCopy as copy, visibleScopes } from './public-patient-portal-view';
import { groupPlans, portalSectionsCopy } from './portal-sections';
import { ApiError, NetworkError } from '@/lib/api/api-error';
import {
  confirmPortalAppointment,
  getPatientPortal,
  logoutPatientPortal,
  verifyPatientAccess,
  type PatientPortal,
  type PortalPlan,
} from '@/lib/patient-access/patient-access-api';
import { accountStatementFixture, emptyAccountStatementFixture } from '@/lib/test/account-statement';
import { planQuoteFixture } from '@/components/treatment-plans/plan-quote-fixture';
import { PUBLIC_REGIONAL_VE } from '@/lib/test/document-regional';

jest.mock('../../lib/patient-access/patient-access-api', () => ({
  ...jest.requireActual('../../lib/patient-access/patient-access-api'),
  verifyPatientAccess: jest.fn(),
  getPatientPortal: jest.fn(),
  confirmPortalAppointment: jest.fn(),
  logoutPatientPortal: jest.fn(),
}));

const mockedVerify = verifyPatientAccess as jest.MockedFunction<typeof verifyPatientAccess>;
const mockedMe = getPatientPortal as jest.MockedFunction<typeof getPatientPortal>;
const mockedConfirm = confirmPortalAppointment as jest.MockedFunction<typeof confirmPortalAppointment>;
const mockedLogout = logoutPatientPortal as jest.MockedFunction<typeof logoutPatientPortal>;

/** El estado de cuenta del personal tal como lo proyecta la API del portal (lista blanca). */
function asPortal(statement: AccountStatement): NonNullable<PatientPortal['account']> {
  return {
    issuedAt: statement.issuedAt,
    clinic: statement.clinic,
    regional: statement.regional,
    patient: {
      firstName: statement.patient.firstName,
      lastName: statement.patient.lastName,
      docType: statement.patient.docType,
      docTypeLabel: statement.patient.docTypeLabel,
      docTypeName: statement.patient.docTypeName,
      docNumber: statement.patient.docNumber,
    },
    addressee: { kind: statement.addressee.kind, name: statement.addressee.name },
    range: statement.range,
    summary: statement.summary,
    plans: statement.plans.map((p) => ({
      id: p.id,
      status: p.status,
      currency: p.currency,
      createdAt: p.createdAt,
      budgeted: p.budgeted,
      billable: p.billable,
      countsTowardsBalance: p.countsTowardsBalance,
      paid: p.paid,
      paidOtherCurrencies: p.paidOtherCurrencies,
      creditMovements: p.creditMovements,
      balance: p.balance,
      rateProviderTimedOut: p.rateProviderTimedOut,
    })),
    movements: statement.movements.map((m) => ({
      paidAt: m.paidAt,
      paidOn: m.paidOn,
      amount: m.amount,
      currency: m.currency,
      method: m.method,
      paymentMethodName: m.paymentMethod?.name ?? null,
      reference: m.reference,
      externalInvoiceNumber: m.externalInvoiceNumber,
      splitLines: m.splitLines,
      receiptNumber: m.receiptNumber,
      locationName: m.location.name,
      treatmentPlanId: m.treatmentPlanId,
      openingBalanceId: m.openingBalanceId,
      voided: m.voided,
      voidedAt: m.voidedAt,
    })),
    installments: statement.installments,
    openingBalances: statement.openingBalances.map((o) => ({
      id: o.id,
      currency: o.currency,
      amount: o.amount,
      asOfDate: o.asOfDate,
      asOfDateApproximate: o.asOfDateApproximate,
      concept: o.concept,
      paid: o.paid,
      pending: o.pending,
    })),
    rateProviderTimedOut: statement.rateProviderTimedOut,
  };
}

const norm = (t: string | null | undefined) => (t ?? '').replace(/\s/g, ' ');

function plan(over: Partial<PortalPlan> = {}): PortalPlan {
  return {
    id: 'plan-1',
    status: 'PRESENTED',
    optionGroupId: null,
    optionLabel: null,
    quote: planQuoteFixture({ currency: 'USD' }),
    ...over,
  };
}

function portal(over: Partial<PatientPortal> = {}): PatientPortal {
  return {
    clinicName: 'Clínica Ávila',
    patientFirstName: 'María',
    minor: false,
    scopes: ['APPOINTMENTS', 'PLANS', 'ACCOUNT'],
    sessionExpiresAt: '2026-11-18T15:30:00.000Z',
    appointments: [
      {
        id: 'ap-1',
        start: '2026-11-20T13:00:00.000Z',
        end: '2026-11-20T13:30:00.000Z',
        status: 'SCHEDULED',
        typeName: 'Control',
        providerName: 'Dra. Laura Gómez',
        location: { name: 'Sede Chacao', address: 'Av. Francisco de Miranda, Caracas', ...PUBLIC_REGIONAL_VE },
        confirmable: true,
      },
    ],
    plans: [plan()],
    account: asPortal(accountStatementFixture()),
    ...over,
  };
}

async function typeBirthDate(user: ReturnType<typeof userEvent.setup>, digits = '05041990') {
  const group = screen.getByRole('group', { name: copy.birthDate });
  const [day] = within(group).getAllByRole('spinbutton');
  await user.click(day);
  await user.keyboard(digits);
}

async function enter(user: ReturnType<typeof userEvent.setup>) {
  render(<PublicPatientPortalView linkToken="tok-abc" />);
  await typeBirthDate(user);
  await user.click(screen.getByRole('button', { name: copy.submit }));
}

beforeEach(() => {
  jest.resetAllMocks();
  mockedLogout.mockResolvedValue(undefined);
  window.print = jest.fn();
});

test('empieza pidiendo la fecha de nacimiento, sin pedir datos', () => {
  render(<PublicPatientPortalView linkToken="tok-abc" />);
  expect(screen.getByRole('heading', { level: 1, name: copy.verifyTitle })).toBeInTheDocument();
  expect(screen.getByRole('group', { name: copy.birthDate })).toBeInTheDocument();
  expect(mockedMe).not.toHaveBeenCalled();
});

test('sin fecha completa no envía nada y lo dice junto al campo', async () => {
  const user = userEvent.setup();
  render(<PublicPatientPortalView linkToken="tok-abc" />);
  await user.click(screen.getByRole('button', { name: copy.submit }));
  expect(await screen.findByText(copy.birthDateRequired)).toBeInTheDocument();
  expect(mockedVerify).not.toHaveBeenCalled();
});

test('verifica con la fecha ISO y enseña las tres pestañas', async () => {
  const user = userEvent.setup();
  mockedVerify.mockResolvedValue({ sessionExpiresAt: 'x', scopes: ['APPOINTMENTS', 'PLANS', 'ACCOUNT'] });
  mockedMe.mockResolvedValue(portal());
  await enter(user);
  expect(mockedVerify).toHaveBeenCalledWith('tok-abc', '1990-04-05');
  expect(await screen.findByRole('heading', { level: 1, name: 'Hola, María' })).toHaveFocus();
  const tabs = screen.getByRole('tablist', { name: copy.tabsLabel });
  expect(within(tabs).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Citas', 'Presupuestos', 'Mi cuenta']);
  // Citas: la hora con el reloj de la sede (Caracas, 12 h), sede, profesional, tipo y estado.
  const card = screen.getByTestId('portal-appointment');
  expect(norm(card.textContent)).toMatch(/9:00 a\. m\./);
  expect(card).toHaveTextContent('Sede Chacao');
  expect(card).toHaveTextContent('Dra. Laura Gómez');
  expect(card).toHaveTextContent('Control');
  expect(card).toHaveTextContent('Agendada');
  expect(screen.queryByTestId('portal-minor')).not.toBeInTheDocument();
});

test('las flechas recorren las pestañas y Enter elige (teclado)', async () => {
  const user = userEvent.setup();
  mockedVerify.mockResolvedValue({ sessionExpiresAt: 'x', scopes: [] });
  mockedMe.mockResolvedValue(portal());
  await enter(user);
  const first = await screen.findByRole('tab', { name: 'Citas' });
  act(() => first.focus());
  await user.keyboard('{ArrowRight}');
  expect(screen.getByRole('tab', { name: 'Presupuestos' })).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(screen.getByRole('tab', { name: 'Presupuestos' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('heading', { name: portalSectionsCopy.plansHeading })).toBeInTheDocument();
});

test('solo las pestañas de los apartados compartidos', async () => {
  const user = userEvent.setup();
  mockedVerify.mockResolvedValue({ sessionExpiresAt: 'x', scopes: ['ACCOUNT'] });
  mockedMe.mockResolvedValue(portal({ scopes: ['ACCOUNT'], appointments: null, plans: null }));
  await enter(user);
  const tabs = await screen.findByRole('tablist', { name: copy.tabsLabel });
  expect(within(tabs).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Mi cuenta']);
  expect(screen.getByRole('heading', { name: portalSectionsCopy.accountHeading })).toBeInTheDocument();
});

test('visibleScopes: un apartado de scopes que llega null no aparece', () => {
  expect(visibleScopes(portal({ scopes: ['APPOINTMENTS', 'PLANS'], plans: null, account: null }))).toEqual([
    'APPOINTMENTS',
  ]);
});

test('400: «Datos incorrectos» con la ayuda, y se puede volver a intentar', async () => {
  const user = userEvent.setup();
  mockedVerify.mockRejectedValue(
    new ApiError(400, 'Datos incorrectos', { code: 'PATIENT_ACCESS_INVALID', messages: ['Datos incorrectos'] }),
  );
  await enter(user);
  expect(await screen.findByText(copy.invalid)).toBeInTheDocument();
  expect(screen.getByText(copy.invalidHelp)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: copy.submit })).toBeEnabled();
  expect(mockedMe).not.toHaveBeenCalled();
});

test('429: el mensaje de la API con el tiempo y el formulario deshabilitado', async () => {
  const user = userEvent.setup();
  const message = 'Demasiados intentos. Por seguridad, el enlace queda bloqueado 30 minutos.';
  mockedVerify.mockRejectedValue(
    new ApiError(429, message, { code: 'PATIENT_ACCESS_LOCKED', messages: [message], retryAfterSeconds: 1500 }),
  );
  await enter(user);
  const locked = await screen.findByTestId('portal-locked');
  expect(locked).toHaveTextContent(message);
  expect(locked).toHaveTextContent('Podrás volver a intentarlo en 25 minutos.');
  expect(screen.getByRole('button', { name: copy.submit })).toBeDisabled();
});

test('error de red al cargar: reintentar vuelve a pedir los datos', async () => {
  const user = userEvent.setup();
  mockedVerify.mockResolvedValue({ sessionExpiresAt: 'x', scopes: [] });
  mockedMe.mockRejectedValueOnce(new NetworkError(new TypeError('fetch'))).mockResolvedValueOnce(portal());
  await enter(user);
  expect(await screen.findByText(copy.loadError)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: copy.retry }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Hola, María' })).toBeInTheDocument();
  expect(mockedMe).toHaveBeenCalledTimes(2);
});

test('401 al cargar: vuelve a la verificación con «Tu sesión caducó…»', async () => {
  const user = userEvent.setup();
  mockedVerify.mockResolvedValue({ sessionExpiresAt: 'x', scopes: [] });
  mockedMe.mockRejectedValue(new ApiError(401, 'x', { code: 'PATIENT_ACCESS_SESSION_REQUIRED' }));
  await enter(user);
  expect(await screen.findByTestId('portal-verify-notice')).toHaveTextContent(copy.sessionExpired);
  expect(screen.getByRole('group', { name: copy.birthDate })).toBeInTheDocument();
});

test('410 tras revocar: «Este enlace ya no está disponible» sin ningún dato del paciente', async () => {
  const user = userEvent.setup();
  mockedVerify.mockResolvedValue({ sessionExpiresAt: 'x', scopes: [] });
  mockedMe.mockResolvedValue(portal());
  mockedConfirm.mockRejectedValue(new ApiError(410, 'x', { code: 'PATIENT_ACCESS_GONE' }));
  await enter(user);
  await user.click(await screen.findByRole('button', { name: /Confirmar la cita/ }));
  expect(await screen.findByRole('heading', { level: 1, name: copy.goneTitle })).toBeInTheDocument();
  expect(screen.queryByText(/María/)).not.toBeInTheDocument();
  expect(screen.queryByText('Sede Chacao')).not.toBeInTheDocument();
  expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: copy.logout })).not.toBeInTheDocument();
});

test('«Confirmar» confirma la cita y vuelve a leer los datos', async () => {
  const user = userEvent.setup();
  mockedVerify.mockResolvedValue({ sessionExpiresAt: 'x', scopes: [] });
  const confirmed = portal();
  confirmed.appointments = confirmed.appointments!.map((a) => ({ ...a, status: 'CONFIRMED', confirmable: false }));
  mockedMe.mockResolvedValueOnce(portal()).mockResolvedValueOnce(confirmed);
  mockedConfirm.mockResolvedValue({ status: 'CONFIRMED' });
  await enter(user);
  await user.click(await screen.findByRole('button', { name: /Confirmar la cita/ }));
  expect(mockedConfirm).toHaveBeenCalledWith('ap-1');
  expect(await screen.findByText(portalSectionsCopy.confirmed)).toBeInTheDocument();
  expect(screen.getByTestId('portal-appointment')).toHaveTextContent('Confirmada');
  expect(screen.queryByRole('button', { name: /Confirmar la cita/ })).not.toBeInTheDocument();
});

test('vacíos: sin citas, sin presupuestos y «Está al día»', async () => {
  const user = userEvent.setup();
  mockedVerify.mockResolvedValue({ sessionExpiresAt: 'x', scopes: [] });
  mockedMe.mockResolvedValue(portal({ appointments: [], plans: [], account: asPortal(emptyAccountStatementFixture()) }));
  await enter(user);
  expect(await screen.findByText(portalSectionsCopy.appointmentsEmpty)).toBeInTheDocument();
  await user.click(screen.getByRole('tab', { name: 'Presupuestos' }));
  expect(screen.getByText(portalSectionsCopy.plansEmpty)).toBeInTheDocument();
  await user.click(screen.getByRole('tab', { name: 'Mi cuenta' }));
  expect(screen.getByTestId('portal-up-to-date')).toHaveTextContent(portalSectionsCopy.upToDate);
});

test('Mi cuenta: saldo, vencido y próxima cuota por moneda, con los importes de la API', async () => {
  const user = userEvent.setup();
  mockedVerify.mockResolvedValue({ sessionExpiresAt: 'x', scopes: [] });
  mockedMe.mockResolvedValue(portal());
  await enter(user);
  await user.click(await screen.findByRole('tab', { name: 'Mi cuenta' }));
  const rows = screen.getAllByTestId('portal-account-summary');
  const ves = rows.find((r) => r.textContent?.startsWith('VES'))!;
  expect(norm(ves.textContent)).toContain('1.800.000,00');
  expect(norm(ves.textContent)).toContain('(1 cuota)');
  expect(screen.queryByTestId('portal-up-to-date')).not.toBeInTheDocument();
  // «Descargar PDF» pinta el estado de cuenta en la vista de impresión y abre el diálogo.
  await user.click(screen.getByRole('button', { name: portalSectionsCopy.accountPdf }));
  expect(screen.getByTestId('portal-print-account')).toBeInTheDocument();
  await waitFor(() => expect(window.print).toHaveBeenCalled());
});

test('presupuestos: las alternativas A/B juntas y el PDF de cada una', async () => {
  const user = userEvent.setup();
  mockedVerify.mockResolvedValue({ sessionExpiresAt: 'x', scopes: [] });
  mockedMe.mockResolvedValue(
    portal({
      plans: [
        plan({ id: 'a', optionGroupId: 'g1', optionLabel: 'A' }),
        plan({ id: 'solo', status: 'ACCEPTED' }),
        plan({ id: 'b', optionGroupId: 'g1', optionLabel: 'B' }),
      ],
    }),
  );
  await enter(user);
  await user.click(await screen.findByRole('tab', { name: 'Presupuestos' }));
  const group = screen.getByTestId('portal-plan-group');
  expect(within(group).getAllByTestId('portal-plan')).toHaveLength(2);
  expect(group).toHaveTextContent('Opción A');
  expect(group).toHaveTextContent('Opción B');
  expect(screen.getAllByTestId('portal-plan')).toHaveLength(3);
  expect(screen.getByText('Aceptado')).toBeInTheDocument();
  await user.click(within(group).getAllByRole('button', { name: /Descargar PDF/ })[0]);
  expect(screen.getByTestId('portal-print-plan')).toBeInTheDocument();
  await waitFor(() => expect(window.print).toHaveBeenCalled());
});

test('groupPlans: agrupa por optionGroupId en el orden de llegada', () => {
  const groups = groupPlans([
    plan({ id: 'a', optionGroupId: 'g' }),
    plan({ id: 'x' }),
    plan({ id: 'b', optionGroupId: 'g' }),
  ]);
  expect(groups.map((g) => g.map((p) => p.id))).toEqual([['a', 'b'], ['x']]);
});

test('menor de edad: aviso para su responsable', async () => {
  const user = userEvent.setup();
  mockedVerify.mockResolvedValue({ sessionExpiresAt: 'x', scopes: [] });
  mockedMe.mockResolvedValue(portal({ minor: true }));
  await enter(user);
  expect(await screen.findByTestId('portal-minor')).toHaveTextContent(copy.minor);
});

test('«Salir» cierra la sesión y vuelve a la verificación sin datos', async () => {
  const user = userEvent.setup();
  mockedVerify.mockResolvedValue({ sessionExpiresAt: 'x', scopes: [] });
  mockedMe.mockResolvedValue(portal());
  await enter(user);
  await user.click(await screen.findByRole('button', { name: copy.logout }));
  expect(mockedLogout).toHaveBeenCalled();
  expect(screen.getByTestId('portal-verify-notice')).toHaveTextContent(copy.loggedOut);
  expect(screen.queryByText('Sede Chacao')).not.toBeInTheDocument();
});
