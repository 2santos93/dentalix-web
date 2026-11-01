import { render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import userEvent from '@testing-library/user-event';
import { DashboardView } from './dashboard-view';
import { getDashboard, type Dashboard } from '@/lib/dashboard/dashboard-api';
import { listCurrencies } from '@/lib/reference/currencies-api';
import { listStaff } from '@/lib/appointments/staff-api';
import { listAppointments, type ListAppointment } from '@/lib/appointments/appointments-api';
import { listLocations, type ClinicLocation } from '@/lib/locations/locations-api';
import { getCurrentCashSession } from '@/lib/cash-sessions/cash-sessions-api';
import { listInventoryItems } from '@/lib/inventory/inventory-api';
import {
  getLocationsComparison,
  getProductionByProcedure,
  type LocationsComparison,
} from '@/lib/reports/reports-api';
import { clinicLocation } from '@/lib/test/locations';
import { tokenForRole } from '@/lib/test/data-consents';
import { cashSessionFixture } from '@/lib/test/cash-session';
import { getReceivablesSummary, type ReceivablesSummary } from './inicio-api';
import { getWorkQueuesSummary, type WorkQueueItem, type WorkQueueKey } from '@/lib/work-queues/work-queues-api';
import { WorkQueuesProvider } from '@/components/work-queues/work-queues-context';
import { getTokenRole } from '@/lib/auth/token-role';

// jest.mock no reescribe alias: rutas relativas (convención del repo).
jest.mock('../../lib/dashboard/dashboard-api', () => ({ getDashboard: jest.fn() }));
jest.mock('../../lib/reference/currencies-api', () => ({ listCurrencies: jest.fn() }));
jest.mock('../../lib/appointments/staff-api', () => ({ listStaff: jest.fn() }));
jest.mock('../../lib/appointments/appointments-api', () => ({ listAppointments: jest.fn() }));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
// DX-503: los recuentos de «Pendientes» salen de una sola lectura agregada.
jest.mock('../../lib/work-queues/work-queues-api', () => ({
  ...jest.requireActual('../../lib/work-queues/work-queues-api'),
  getWorkQueuesSummary: jest.fn(),
}));
jest.mock('../../lib/cash-sessions/cash-sessions-api', () => ({ getCurrentCashSession: jest.fn() }));
jest.mock('../../lib/inventory/inventory-api', () => ({ listInventoryItems: jest.fn() }));
jest.mock('../../lib/reports/reports-api', () => ({
  getLocationsComparison: jest.fn(),
  getProductionByProcedure: jest.fn(),
}));
jest.mock('./inicio-api', () => ({
  ...jest.requireActual('./inicio-api'),
  getReceivablesSummary: jest.fn(),
}));
// Los avisos de ADMIN tienen sus propias pruebas y sus propias llamadas.
jest.mock('../locations/regional-review-notice', () => ({ RegionalReviewNotice: () => null }));
jest.mock('../payments/rate-backlog-notice', () => ({ RateBacklogNotice: () => null }));

const m = {
  getDashboard: jest.mocked(getDashboard),
  listCurrencies: jest.mocked(listCurrencies),
  listStaff: jest.mocked(listStaff),
  listAppointments: jest.mocked(listAppointments),
  listLocations: jest.mocked(listLocations),
  cash: jest.mocked(getCurrentCashSession),
  inventory: jest.mocked(listInventoryItems),
  comparison: jest.mocked(getLocationsComparison),
  production: jest.mocked(getProductionByProcedure),
  receivables: jest.mocked(getReceivablesSummary),
  workQueues: jest.mocked(getWorkQueuesSummary),
};

/** Lo que devuelve la API por rol (WORK_QUEUE_ROLES): la API reparte, la web pinta. */
const QUEUES_BY_ROLE: Record<string, WorkQueueKey[]> = {
  ADMIN: ['CLOSING_QUEUE', 'ANAMNESIS_REVIEW', 'QUOTE_FOLLOW_UP', 'ACCEPTED_UNSCHEDULED', 'WAITLIST', 'RECEIVABLES', 'LOW_STOCK'],
  DENTIST: ['CLOSING_QUEUE', 'ANAMNESIS_REVIEW'],
  RECEPTION: ['CLOSING_QUEUE', 'QUOTE_FOLLOW_UP', 'ACCEPTED_UNSCHEDULED', 'WAITLIST', 'RECEIVABLES'],
  ASSISTANT: ['ANAMNESIS_REVIEW', 'LOW_STOCK'],
};
const QUEUE_ITEMS: Record<WorkQueueKey, WorkQueueItem> = {
  CLOSING_QUEUE: { key: 'CLOSING_QUEUE', status: 'OK', count: 3 },
  ANAMNESIS_REVIEW: { key: 'ANAMNESIS_REVIEW', status: 'OK', count: 5 },
  QUOTE_FOLLOW_UP: { key: 'QUOTE_FOLLOW_UP', status: 'OK', count: 2 },
  ACCEPTED_UNSCHEDULED: { key: 'ACCEPTED_UNSCHEDULED', status: 'OK', count: 0 },
  WAITLIST: { key: 'WAITLIST', status: 'OK', count: 1 },
  RECEIVABLES: { key: 'RECEIVABLES', status: 'OK', count: 2, overdue: [{ currency: 'COP', amount: 780000 }] },
  LOW_STOCK: { key: 'LOW_STOCK', status: 'OK', count: 4 },
};
function queuesFor(
  token: string,
  keys?: readonly WorkQueueKey[],
  override: Partial<Record<WorkQueueKey, WorkQueueItem>> = {},
) {
  const role = getTokenRole(token) ?? 'ADMIN';
  return {
    generatedAt: FROZEN_NOW.toISOString(),
    items: QUEUES_BY_ROLE[role]
      .filter((k) => !keys || keys.includes(k))
      .map((k) => override[k] ?? QUEUE_ITEMS[k]),
  };
}
/** Las lecturas COMPLETAS (las de «Mi día»; las del menú llevan `keys`). */
const fullReads = () => m.workQueues.mock.calls.filter(([, keys]) => keys === undefined).length;

/** Inicio vive dentro del AppShell, que da la lectura compartida de las listas. */
function render(ui: ReactElement<{ token: string }>) {
  return rtlRender(
    <WorkQueuesProvider token={ui.props.token} pathname="/dashboard">
      {ui}
    </WorkQueuesProvider>,
  );
}

// Sábado 15/08/2026 07:00 en Bogotá (GMT−5): citas antes y después de «ahora».
const FROZEN_NOW = new Date('2026-08-15T12:00:00.000Z');

const sedes: ClinicLocation[] = [
  clinicLocation({ id: 'loc-1', name: 'Sede principal' }),
  clinicLocation({ id: 'loc-2', name: 'Sede Norte', createdAt: '2026-02-01T00:00:00.000Z' }),
];

function appointment(overrides: Partial<ListAppointment>): ListAppointment {
  return {
    id: 'a',
    tenantId: 't1',
    locationId: 'loc-1',
    patientId: 'p-1',
    patientFirstName: 'María',
    patientLastName: 'López',
    providerId: 'staff-1',
    start: '2026-08-15T14:00:00.000Z',
    end: '2026-08-15T14:30:00.000Z',
    status: 'SCHEDULED',
    reason: null,
    planItemIds: [],
    medicalAlerts: { hasCriticalAlert: false, requiresPremedication: false, anamnesisStatus: 'CURRENT', alerts: [], anamnesisReviewedAt: null },
    balance: { hasOverdue: false, overdueDays: null },
    ...overrides,
  } as ListAppointment;
}

const todayAppointments: ListAppointment[] = [
  appointment({ id: 'a1', start: '2026-08-15T13:00:00.000Z', status: 'COMPLETED' }),
  appointment({
    id: 'a2',
    patientId: 'p-2',
    patientFirstName: 'Luis',
    patientLastName: 'Pérez',
    start: '2026-08-15T15:00:00.000Z',
    status: 'SCHEDULED',
    medicalAlerts: {
      hasCriticalAlert: true,
      requiresPremedication: true,
      anamnesisStatus: 'EXPIRED',
      alerts: ['alergiaPenicilina'],
      anamnesisReviewedAt: null,
    },
    balance: { hasOverdue: true, overdueDays: 40 },
  }),
  appointment({ id: 'a3', start: '2026-08-15T16:00:00.000Z', status: 'CONFIRMED' }),
  appointment({ id: 'a4', start: '2026-08-15T17:00:00.000Z', status: 'ARRIVED' }),
  appointment({ id: 'a5', start: '2026-08-15T18:00:00.000Z', status: 'CANCELLED' }),
];

function dashboard(): Dashboard {
  return {
    period: { from: '2026-08-01T00:00:00.000Z', to: '2026-08-16T00:00:00.000Z' },
    incomes: {
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-16T00:00:00.000Z',
      currency: 'COP',
      totalConverted: 1250000,
      count: 12,
      byCurrency: { COP: 1000000, USD: 60 },
    },
    lowStockItems: { count: 0, items: [] },
    upcomingAppointments: [],
    patientCount: 42,
  };
}

const metric = (value: number, previous: number, change: number, trend: 'BETTER' | 'WORSE' | 'EQUAL') => ({
  value,
  previous,
  change,
  trend,
});
function comparison(locations = 1): LocationsComparison {
  const metrics = {
    production: [{ currency: 'COP', ...metric(3000000, 2500000, 20, 'BETTER') }],
    collected: [{ currency: 'COP', ...metric(1000000, 900000, 11.1, 'BETTER') }],
    collectionRate: [{ currency: 'COP', ...metric(33.3, 36, -2.7, 'WORSE') }],
    completedAppointments: metric(40, 38, 5.3, 'BETTER'),
    noShowRate: metric(5, 7, -2, 'BETTER'),
    newPatients: metric(6, 6, 0, 'EQUAL'),
    averageTicket: [{ currency: 'COP', ...metric(75000, 65789, 14, 'BETTER') }],
    occupancy: metric(64, 60, 4, 'BETTER'),
  };
  const kpi = (key: string, label: string, unit: string, changeUnit: string) => ({
    key,
    label,
    unit,
    perCurrency: unit === 'MONEY',
    direction: key === 'noShowRate' ? 'LOWER_IS_BETTER' : 'HIGHER_IS_BETTER',
    changeUnit,
    howItIsCalculated: '',
  });
  const row = (id: string | null, name: string) => ({
    locationId: id,
    name,
    isActive: true,
    timeZone: 'America/Bogota',
    hasActivity: true,
    previousPeriodUnattributed: false,
    metrics,
  });
  return {
    from: '2026-08-01',
    to: '2026-08-15',
    compare: 'previous',
    previousFrom: '2026-07-17',
    previousTo: '2026-07-31',
    currency: null,
    kpis: [
      kpi('production', 'Producción', 'MONEY', 'PERCENT'),
      kpi('collected', 'Cobrado', 'MONEY', 'PERCENT'),
      kpi('collectionRate', 'Tasa de cobro', 'PERCENT', 'POINTS'),
      kpi('completedAppointments', 'Citas atendidas', 'COUNT', 'PERCENT'),
      kpi('noShowRate', 'Inasistencia', 'PERCENT', 'POINTS'),
      kpi('newPatients', 'Pacientes nuevos', 'COUNT', 'PERCENT'),
      kpi('averageTicket', 'Ticket medio', 'MONEY', 'PERCENT'),
      kpi('occupancy', 'Ocupación', 'PERCENT', 'POINTS'),
    ],
    locations: locations === 1 ? [row('loc-1', 'Sede principal')] : [row('loc-1', 'Sede principal'), row('loc-2', 'Sede Norte')],
    total: row(null, 'Total'),
    hasActivity: true,
    previousPeriodUnattributed: false,
  } as unknown as LocationsComparison;
}

const receivables: ReceivablesSummary = {
  asOf: '2026-08-15',
  scope: { location: null },
  totals: [
    {
      currency: 'COP',
      patients: 2,
      balance: 880000,
      debt: 880000,
      credit: 0,
      buckets: { current: 100000, days0to30: 100000, days31to60: 80000, days61to90: 100000, over90: 500000 },
    },
  ],
};

function setActiveSede(id: string | null) {
  if (id) window.localStorage.setItem('dentalix.activeLocationId', id);
  else window.localStorage.removeItem('dentalix.activeLocationId');
}

beforeAll(() => {
  jest.useFakeTimers({ now: FROZEN_NOW, advanceTimers: true });
});
afterAll(() => {
  jest.useRealTimers();
});

beforeEach(() => {
  window.localStorage.clear();
  for (const fn of Object.values(m)) fn.mockReset();
  m.listLocations.mockResolvedValue(sedes);
  m.listCurrencies.mockResolvedValue([
    { code: 'COP', name: 'Peso', symbol: '$' },
    { code: 'USD', name: 'Dólar', symbol: '$' },
  ]);
  m.listStaff.mockResolvedValue([{ userId: 'staff-1', fullName: 'Dra. Ana Ríos', role: 'DENTIST', locationIds: null }] as never);
  m.listAppointments.mockResolvedValue(todayAppointments);
  m.getDashboard.mockResolvedValue(dashboard());
  m.comparison.mockResolvedValue(comparison());
  m.workQueues.mockImplementation(async (token, keys) => queuesFor(token, keys));
  m.receivables.mockResolvedValue(receivables);
  m.inventory.mockResolvedValue({
    items: [{ id: 'i1', name: 'Guantes de nitrilo', unit: 'caja', stock: 1, minStock: 5, lowStock: true }],
    total: 4,
    page: 1,
    pageSize: 8,
  } as never);
  m.cash.mockResolvedValue({
    locationId: 'loc-1',
    settings: { requireOpenSession: false, blindClose: false },
    session: cashSessionFixture({ openedAt: '2026-08-15T13:02:00.000Z' }),
  } as never);
  m.production.mockResolvedValue({
    totals: [{ currency: 'COP', count: 7, gross: 900000, discounts: 50000, net: 850000, averageNet: 121428 }],
  } as never);
});

function pendingValue(id: string) {
  return screen.findByTestId(`pending-${id}-value`);
}

describe('Inicio · ADMIN', () => {
  it('cabecera con alcance y la zona de la sede (R1, useSedeZoneNote), con «Cambiar zona» a esa sede', async () => {
    render(<DashboardView token={tokenForRole('ADMIN')} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Inicio' })).toBeInTheDocument();
    const scope = await screen.findByTestId('dashboard-scope');
    expect(scope).toHaveTextContent('Todas las sedes');
    expect(await within(scope).findByTestId('dashboard-zone-note')).toHaveTextContent(
      /^Días en hora de .+ \(UTC−5\) \(Sede principal\)\.$/,
    );
    const change = within(scope).getByRole('link', { name: 'Cambiar zona' });
    expect(change).toHaveAttribute('href', '/settings/sedes?sede=loc-1');
  });

  it('Hoy: cuenta por estado (sin canceladas) y lista con alertas, anamnesis y saldo vencido', async () => {
    render(<DashboardView token={tokenForRole('ADMIN')} />);
    const today = await screen.findByRole('region', { name: 'Hoy' });
    await within(today).findByRole('list', { name: 'Citas de hoy' });
    expect(within(today).getByTestId('today-total')).toHaveTextContent('4');
    expect(within(today).getByTestId('today-toConfirm')).toHaveTextContent('1');
    expect(within(today).getByTestId('today-confirmed')).toHaveTextContent('1');
    expect(within(today).getByTestId('today-inClinic')).toHaveTextContent('1');
    expect(within(today).getByTestId('today-completed')).toHaveTextContent('1');
    expect(within(today).getByText('1 cita cancelada hoy, fuera de la cuenta.')).toBeInTheDocument();

    const luis = within(today).getByRole('link', { name: 'Luis Pérez' });
    expect(luis).toHaveAttribute('href', '/patients/p-2');
    const row = luis.closest('li') as HTMLElement;
    expect(within(row).getByText('Alerta médica')).toBeInTheDocument();
    expect(within(row).getByText(/Alergia a penicilina/)).toHaveClass('sr-only');
    expect(within(row).getByText('Premedicación')).toBeInTheDocument();
    expect(within(row).getByText('Anamnesis caducada')).toBeInTheDocument();
    expect(within(row).getByText('Saldo vencido')).toBeInTheDocument();
    expect(within(row).getByText('Agendada')).toBeInTheDocument();
    await within(row).findByText('Dra. Ana Ríos');
    // La hora es la de la sede: 15:00Z = 10:00 a. m. en Bogotá.
    expect(within(row).getByText(/10:00/)).toBeInTheDocument();
    // Pide el día civil de la sede, sin acotar a un profesional.
    expect(m.listAppointments.mock.calls[0][1]).toEqual({
      from: '2026-08-15T05:00:00.000Z',
      to: '2026-08-16T04:59:59.999Z',
      providerId: undefined,
    });
  });

  it('Pendientes: cada fila con su número y a dónde lleva; «Al día» si no hay nada', async () => {
    render(<DashboardView token={tokenForRole('ADMIN')} />);
    expect(await pendingValue('closing')).toHaveTextContent('3');
    expect(await pendingValue('follow-up')).toHaveTextContent('2');
    expect(await pendingValue('unscheduled')).toHaveTextContent('Al día');
    expect(await pendingValue('waitlist')).toHaveTextContent('1');
    expect(await pendingValue('anamnesis')).toHaveTextContent('5');
    expect(await pendingValue('low-stock')).toHaveTextContent('4');
    expect(await pendingValue('receivables')).toHaveTextContent('2 pacientes');
    expect(screen.getByTestId('pending-receivables')).toHaveTextContent(/Vencido: .*780\.000,00/);
    // Sin sede activa no hay «mi caja»: se pide elegir una, sin llamar.
    expect(await pendingValue('cash')).toHaveTextContent('Elige una sede');
    expect(m.cash).not.toHaveBeenCalled();
    const pending = screen.getByRole('region', { name: 'Pendientes' });
    expect(within(pending).getByRole('link', { name: 'Presupuestos por seguir' })).toHaveAttribute('href', '/presupuestos');
    expect(within(pending).getByRole('link', { name: 'Cartera con saldo' })).toHaveAttribute('href', '/caja/cartera');
    expect(within(pending).getByRole('link', { name: 'Pendiente de cerrar' })).toHaveAttribute(
      'href',
      '/agenda/pendiente-de-cerrar',
    );
  });

  it('una lista que falla avisa en su fila con Reintentar y las demás se pintan', async () => {
    let failed = false;
    m.workQueues.mockImplementation(async (token, keys) => {
      if (keys === undefined && !failed) {
        failed = true;
        return queuesFor(token, keys, { QUOTE_FOLLOW_UP: { key: 'QUOTE_FOLLOW_UP', status: 'ERROR', count: null } });
      }
      return queuesFor(token, keys);
    });
    render(<DashboardView token={tokenForRole('ADMIN')} />);
    const row = await screen.findByTestId('pending-follow-up');
    await within(row).findByText('No se pudo cargar');
    expect(await pendingValue('closing')).toHaveTextContent('3');
    expect(await pendingValue('waitlist')).toHaveTextContent('1');
    const before = fullReads();
    await userEvent.click(within(row).getByRole('button', { name: 'Volver a cargar «Presupuestos por seguir»' }));
    expect(await pendingValue('follow-up')).toHaveTextContent('2');
    expect(fullReads()).toBe(before + 1);
  });

  it('si no se pueden contar las listas: error de sección con Reintentar (la caja sigue)', async () => {
    let fail = true;
    m.workQueues.mockImplementation(async (token, keys) => {
      if (keys === undefined && fail) throw new Error('network');
      return queuesFor(token, keys);
    });
    render(<DashboardView token={tokenForRole('ADMIN')} />);
    const pending = await screen.findByRole('region', { name: 'Pendientes' });
    expect(await within(pending).findByRole('alert')).toHaveTextContent('No se pudieron contar tus listas de trabajo.');
    expect(await pendingValue('cash')).toHaveTextContent('Elige una sede');
    fail = false;
    await userEvent.click(within(pending).getByRole('button', { name: 'Reintentar' }));
    expect(await pendingValue('closing')).toHaveTextContent('3');
  });

  it('las listas a 0 se pliegan en «Al día» y se despliegan con teclado', async () => {
    render(<DashboardView token={tokenForRole('ADMIN')} />);
    const toggle = await screen.findByTestId('pending-folded-toggle');
    expect(toggle).toHaveTextContent('Al día: 1 lista');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('pending-unscheduled')).not.toBeVisible();
    toggle.focus();
    await userEvent.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('pending-unscheduled')).toBeVisible();
    expect(screen.getByTestId('pending-unscheduled-value')).toHaveTextContent('Al día');
  });

  it('todas a 0: estado vacío «Todo al día», con las listas plegadas', async () => {
    m.workQueues.mockImplementation(async (token, keys) => ({
      generatedAt: FROZEN_NOW.toISOString(),
      items: queuesFor(token, keys).items.map((i) =>
        i.key === 'RECEIVABLES' ? { ...i, count: 0, overdue: [] } : { ...i, count: 0 },
      ),
    }));
    render(<DashboardView token={tokenForRole('ADMIN')} />);
    expect(await screen.findByText('Todo al día')).toBeInTheDocument();
    expect(screen.getByTestId('pending-folded-toggle')).toHaveTextContent('Al día: 7 listas');
    expect(screen.queryByRole('list', { name: 'Pendientes' })).not.toBeInTheDocument();
  });

  it('una sola lectura completa alimenta «Mi día» (sin un /count por lista)', async () => {
    render(<DashboardView token={tokenForRole('ADMIN')} />);
    expect(await pendingValue('closing')).toHaveTextContent('3');
    expect(fullReads()).toBe(1);
  });

  it('Resultados del período: cobrado convertido (hasta + 1 día) y los indicadores frente al período anterior', async () => {
    render(<DashboardView token={tokenForRole('ADMIN')} />);
    await waitFor(() => expect(m.getDashboard).toHaveBeenCalledTimes(1));
    expect(m.getDashboard.mock.calls[0][1]).toMatchObject({ from: '2026-08-01', to: '2026-08-16', currency: 'COP' });
    expect(m.comparison.mock.calls[0][1]).toEqual({ from: '2026-08-01', to: '2026-08-15', compare: 'previous' });
    const period = screen.getByRole('region', { name: 'Resultados del período' });
    const incomes = await within(period).findByTestId('dashboard-incomes');
    expect(incomes).toHaveTextContent('Cobrado, en COP');
    expect(incomes).toHaveTextContent('12 abonos');
    expect(incomes).toHaveTextContent('Cada abono en otra moneda, a COP con la tasa de su día.');
    const production = await within(period).findByTestId('dashboard-kpi-production');
    expect(production).toHaveTextContent('Producción');
    expect(production).toHaveTextContent(/Mejora: \+20\s?% frente a/);
    expect(within(period).getByTestId('dashboard-kpi-noShowRate')).toHaveTextContent('Inasistencia');
    expect(within(period).getByText(/frente al 17\/07\/2026 – 31\/07\/2026/)).toBeInTheDocument();
    // Con una sola sede no hay tabla «Por sede».
    expect(within(period).queryByRole('heading', { name: 'Por sede' })).not.toBeInTheDocument();
  });

  it('«Por sede» aparece con dos sedes o más', async () => {
    m.comparison.mockResolvedValue(comparison(2));
    render(<DashboardView token={tokenForRole('ADMIN')} />);
    const table = await screen.findByRole('table', { name: 'Indicadores por sede' });
    expect(within(table).getByText('Sede Norte')).toBeInTheDocument();
  });

  it('Cartera por antigüedad: los cinco tramos por moneda y lo vencido', async () => {
    render(<DashboardView token={tokenForRole('ADMIN')} />);
    const aging = await screen.findByTestId('aging-COP');
    expect(aging).toHaveTextContent('2 pacientes');
    expect(aging).toHaveTextContent('Por vencer');
    expect(aging).toHaveTextContent('Más de 90 días');
    expect(within(aging).getByRole('img', { name: 'Reparto por antigüedad de lo que se debe en COP' })).toBeInTheDocument();
  });

  it('un error de Hoy es del bloque (escalón 1) y su reintento vuelve a pedir', async () => {
    m.listAppointments.mockRejectedValueOnce(new Error('network'));
    render(<DashboardView token={tokenForRole('ADMIN')} />);
    const today = await screen.findByRole('region', { name: 'Hoy' });
    await within(today).findByText('No pudimos cargar las citas de hoy.');
    await userEvent.click(within(today).getByRole('button', { name: 'Reintentar' }));
    await within(today).findByRole('list', { name: 'Citas de hoy' });
  });

  it('sin zona de la sede: SedeConfigError y ninguna consulta del día', async () => {
    m.listLocations.mockResolvedValue([clinicLocation({ timeZone: null })]);
    render(<DashboardView token={tokenForRole('ADMIN')} />);
    expect(
      await screen.findByText('No se pudo saber la zona horaria de la sede. Vuelve a intentarlo.'),
    ).toBeInTheDocument();
    expect(m.listAppointments).not.toHaveBeenCalled();
    expect(m.getDashboard).not.toHaveBeenCalled();
  });
});

describe('Inicio · RECEPTION', () => {
  it('ve hoy y sus pendientes, nunca pide el panel financiero, los reportes ni lo clínico', async () => {
    setActiveSede('loc-2');
    render(<DashboardView token={tokenForRole('RECEPTION')} />);
    expect(await pendingValue('cash')).toHaveTextContent('Abierta desde');
    expect(await pendingValue('follow-up')).toHaveTextContent('2');
    expect(await pendingValue('receivables')).toHaveTextContent('2 pacientes');
    expect(screen.getByTestId('dashboard-scope')).toHaveTextContent('Sede Norte');
    // La zona es texto: recepción no cambia los ajustes de la sede.
    expect(await screen.findByTestId('dashboard-zone-note')).not.toHaveAttribute('href');
    expect(screen.queryByRole('link', { name: 'Cambiar zona' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('pending-anamnesis')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pending-low-stock')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Resultados del período' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Cartera por antigüedad' })).not.toBeInTheDocument();
    expect(m.getDashboard).not.toHaveBeenCalled();
    expect(m.comparison).not.toHaveBeenCalled();
    expect(m.inventory).not.toHaveBeenCalled();
  });
});

describe('Inicio · DENTIST', () => {
  it('sus pacientes de hoy (acotado a él), su producción y lo suyo por cerrar', async () => {
    render(<DashboardView token={tokenForRole('DENTIST')} />);
    await screen.findByRole('region', { name: 'Tus pacientes de hoy' });
    await waitFor(() => expect(m.listAppointments).toHaveBeenCalled());
    expect(m.listAppointments.mock.calls[0][1]).toMatchObject({ providerId: 'u1' });
    expect(await pendingValue('closing')).toHaveTextContent('3');
    expect(await pendingValue('anamnesis')).toHaveTextContent('5');
    const production = await screen.findByTestId('production-COP');
    expect(production).toHaveTextContent('7 procedimientos');
    expect(m.production.mock.calls[0][1]).toEqual({ from: '2026-08-01', to: '2026-08-15' });
    for (const fn of [m.getDashboard, m.comparison, m.receivables, m.cash, m.inventory, m.listStaff]) {
      expect(fn).not.toHaveBeenCalled();
    }
  });
});

describe('Inicio · ASSISTANT', () => {
  it('hoy de la sede, anamnesis y bajo stock, con la lista «Por reponer»', async () => {
    render(<DashboardView token={tokenForRole('ASSISTANT')} />);
    expect(await pendingValue('anamnesis')).toHaveTextContent('5');
    expect(await pendingValue('low-stock')).toHaveTextContent('4');
    const lowStock = await screen.findByRole('region', { name: 'Por reponer' });
    const gloves = (await within(lowStock).findByText('Guantes de nitrilo')).closest('li') as HTMLElement;
    expect(gloves).toHaveTextContent('Faltan 4');
    expect(within(lowStock).getByText('Se muestran 1 de 4.')).toBeInTheDocument();
    expect(screen.queryByTestId('pending-closing')).not.toBeInTheDocument();
    expect(m.getDashboard).not.toHaveBeenCalled();
  });
});
