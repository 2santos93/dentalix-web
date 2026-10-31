import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CashRegisterView } from './cash-register-view';
import { ApiError, NetworkError } from '@/lib/api/client';
import {
  downloadCashPaymentsCsv,
  listCashPayments,
  voidPayment,
  type CashPayment,
  type CashPaymentsResponse,
} from '@/lib/payments/payments-api';
import { listPaymentMethods, type ClinicPaymentMethod } from '@/lib/payments/payment-methods-api';
import { saveCsv } from '@/lib/files/save-csv';
import { notifyError } from '@/components/errors/notify';
import { presetRange as presetRangeIn } from '@/lib/payments/cash-period';
import { listLocations } from '@/lib/locations/locations-api';
import { getPaymentReceipt } from '@/lib/payments/payment-receipts-api';
import { paymentReceiptFixture } from '@/lib/test/payment-receipt';
import { clinicLocation } from '@/lib/test/locations';


/** UX v2: Recibo y Anular viven en el «⋯» de cada fila («Acciones de abono de …»). */
async function pickRowAction(
  user: ReturnType<typeof userEvent.setup>,
  patient: RegExp,
  item: string,
  scope: HTMLElement = document.body,
): Promise<void> {
  await user.click(await within(scope).findByRole('button', { name: new RegExp(`acciones de abono de ${patient.source}`, 'i') }));
  await user.click(await screen.findByRole('menuitem', { name: item }));
}

/** Los elementos del menú «⋯» de una fila, abierto y cerrado con Escape. */
async function rowMenuItems(user: ReturnType<typeof userEvent.setup>, row: HTMLElement): Promise<string[]> {
  await user.click(within(row).getByRole('button', { name: /^acciones de abono de/i }));
  const items = (await screen.findAllByRole('menuitem')).map((i) => i.textContent ?? '');
  await user.keyboard('{Escape}');
  return items;
}

jest.mock('../../lib/payments/payment-receipts-api', () => ({
  ...jest.requireActual('../../lib/payments/payment-receipts-api'),
  getPaymentReceipt: jest.fn(),
}));

// DX-097: los atajos salen del día de la SEDE (su zona, de GET /locations).
jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest.fn(),
}));
const mockedLocations = listLocations as jest.MockedFunction<typeof listLocations>;
const SEDE_ZONE = 'America/Bogota';
const presetRange = (preset: Parameters<typeof presetRangeIn>[0]) => presetRangeIn(preset, SEDE_ZONE);

jest.mock('../../lib/payments/payments-api', () => ({
  listCashPayments: jest.fn(),
  voidPayment: jest.fn(),
  downloadCashPaymentsCsv: jest.fn(),
}));
// DX-395: el filtro ofrece todos los medios de la clínica, también los inactivos.
jest.mock('../../lib/payments/payment-methods-api', () => ({
  ...jest.requireActual('../../lib/payments/payment-methods-api'),
  listPaymentMethods: jest.fn(),
}));
jest.mock('../../lib/files/save-csv', () => ({ saveCsv: jest.fn() }));
jest.mock('../errors/notify', () => ({ notifyError: jest.fn() }));

const mockedList = listCashPayments as jest.MockedFunction<typeof listCashPayments>;
const mockedVoid = voidPayment as jest.MockedFunction<typeof voidPayment>;
const mockedCsv = downloadCashPaymentsCsv as jest.MockedFunction<typeof downloadCashPaymentsCsv>;
const mockedMethods = listPaymentMethods as jest.MockedFunction<typeof listPaymentMethods>;
const mockedSaveCsv = saveCsv as jest.MockedFunction<typeof saveCsv>;
const mockedNotify = notifyError as jest.MockedFunction<typeof notifyError>;

function clinicMethod(overrides: Partial<ClinicPaymentMethod>): ClinicPaymentMethod {
  return {
    id: 'pm-x',
    name: 'Medio',
    kind: 'OTHER',
    active: true,
    requiresReference: false,
    legacyMethod: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}
const CLINIC_METHODS: ClinicPaymentMethod[] = [
  clinicMethod({ id: 'pm-cash', name: 'Efectivo', kind: 'CASH', legacyMethod: 'CASH' }),
  clinicMethod({ id: 'pm-mobile', name: 'Pago móvil', kind: 'DIGITAL', requiresReference: true }),
  clinicMethod({ id: 'pm-check', name: 'Cheque', active: false }),
];

const anaCash: CashPayment = {
  id: 'pay-1',
  createdById: 'u-recep',
  canVoid: true,
  paidAt: '2026-10-15T17:00:00.000Z',
  paidOn: '2026-10-15',
  registeredOn: '2026-10-15',
  registeredToday: true,
  amount: 150000.5,
  currency: 'COP',
  method: 'CASH',
  paymentMethod: null,
  reference: null,
  notes: null,
  location: { id: 'loc-1', name: 'Sede principal' },
  patient: { id: 'pat-1', fullName: 'Ana Gómez' },
  treatmentPlan: {
    id: 'plan-1',
    status: 'ACCEPTED',
    createdAt: '2026-09-01T15:00:00.000Z',
  },
  openingBalance: null,
  splitId: null,
  splitLines: null,
};
const betoCard: CashPayment = {
  ...anaCash,
  id: 'pay-2',
  createdById: 'u-admin',
  canVoid: false,
  amount: 50.25,
  currency: 'USD',
  method: 'CARD',
  location: { id: 'loc-2', name: 'Sede Norte' },
  patient: { id: 'pat-2', fullName: 'Beto Ruiz' },
  treatmentPlan: {
    id: 'plan-2',
    status: 'DRAFT',
    createdAt: '2026-10-02T15:00:00.000Z',
  },
};

function response(overrides: Partial<CashPaymentsResponse> = {}): CashPaymentsResponse {
  const items = overrides.items ?? [anaCash, betoCard];
  return {
    items,
    total: items.length,
    page: 1,
    pageSize: 20,
    from: '2026-10-15',
    to: '2026-10-15',
    scope: { location: null },
    summary: {
      count: 2,
      byCurrency: [
        { currency: 'COP', total: 150000.5, count: 1 },
        { currency: 'USD', total: 50.25, count: 1 },
      ],
      // DX-377: el resumen se pinta por medio de pago de la clínica.
      byPaymentMethod: [
        { paymentMethodId: 'pm-cash', name: 'Efectivo', currency: 'COP', total: 150000.5, count: 1 },
        { paymentMethodId: 'pm-card', name: 'Tarjeta', currency: 'USD', total: 50.25, count: 1 },
      ],
      byMethod: [
        { method: 'CASH', currency: 'COP', total: 150000.5, count: 1 },
        { method: 'CARD', currency: 'USD', total: 50.25, count: 1 },
      ],
    },
    ...overrides,
  };
}

// Normaliza los espacios duros de Intl (es: "150.000,50 COP" lleva U+00A0).
function money(text: string | null | undefined): string {
  return (text ?? '').replace(/\s/g, ' ');
}

beforeEach(() => {
  mockedList.mockReset();
  mockedVoid.mockReset();
  mockedCsv.mockReset();
  mockedSaveCsv.mockReset();
  mockedNotify.mockReset();
  mockedMethods.mockReset();
  mockedMethods.mockResolvedValue(CLINIC_METHODS);
  mockedLocations.mockReset();
  mockedLocations.mockResolvedValue([
    clinicLocation({
      id: 'loc-1',
      name: 'Sede principal',
      address: null,
      country: 'CO',
      isActive: true,
      timeZone: SEDE_ZONE,
      createdAt: '2026-01-01T00:00:00.000Z',
    }),
  ]);
});

it('pide el día de hoy al entrar y pinta cada abono con paciente, plan, método, sede y monto', async () => {
  mockedList.mockResolvedValue(response());
  render(<CashRegisterView token="tok" />);

  const table = await screen.findByRole('table', { name: /abonos/i });
  expect(mockedList).toHaveBeenCalledWith('tok', {
    ...presetRange('today'),
    page: 1,
  });

  const row = within(table).getByRole('row', { name: /ana gómez/i });
  expect(within(row).getByRole('link', { name: 'Ana Gómez' })).toHaveAttribute(
    'href',
    '/patients/pat-1',
  );
  expect(within(row).getByText('15/10/2026')).toBeInTheDocument();
  expect(within(row).getByText(/plan del 01\/09\/2026/i)).toBeInTheDocument();
  expect(within(row).getByText('Efectivo')).toBeInTheDocument();
  expect(within(row).getByText('Sede principal')).toBeInTheDocument();
  const amount = within(row).getByText(/150\.000,50/);
  expect(amount.closest('td')).toHaveClass('text-right', 'tabular-nums');
});

it('resume el período por moneda y por método en un registro, no en tarjetas', async () => {
  mockedList.mockResolvedValue(response());
  render(<CashRegisterView token="tok" />);

  const summary = await screen.findByRole('region', {
    name: /resumen del período/i,
  });
  const byCurrency = within(summary).getByRole('list', { name: /por moneda/i });
  const cop = within(byCurrency).getByText('COP').closest('li');
  expect(money(cop?.textContent)).toMatch(/150\.000,50/);
  expect(money(cop?.textContent)).toMatch(/1 abono(?!s)/);

  const byMethod = within(summary).getByRole('list', { name: /por método/i });
  const card = within(byMethod).getByText('Tarjeta').closest('li');
  expect(money(card?.textContent)).toMatch(/50,25/);
  expect(money(card?.textContent)).toMatch(/USD/);
});

it('DX-377: cada abono muestra su medio de pago y su referencia', async () => {
  mockedList.mockResolvedValue(
    response({
      items: [{ ...anaCash, method: 'TRANSFER', paymentMethod: { id: 'pm-mobile', name: 'Pago móvil' }, reference: '0412 555' }],
    }),
  );
  render(<CashRegisterView token="tok" />);
  expect((await screen.findAllByText('Pago móvil')).length).toBeGreaterThan(0);
  expect(screen.getAllByText('Ref. 0412 555').length).toBeGreaterThan(0);
});

it('marca el alcance de sede: "Todas las sedes" sin sede activa, el nombre con una', async () => {
  mockedList.mockResolvedValueOnce(response());
  const { unmount } = render(<CashRegisterView token="tok" />);
  expect(await screen.findByText('Todas las sedes')).toBeInTheDocument();
  unmount();

  mockedList.mockResolvedValueOnce(
    response({ scope: { location: { id: 'loc-2', name: 'Sede Norte' } } }),
  );
  render(<CashRegisterView token="tok" />);
  expect(await screen.findByText(/caja de sede norte/i)).toBeInTheDocument();
});

const restrictedToken = (loc: string[]): string => {
  const b64url = (value: string) =>
    btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url('{"alg":"HS256"}')}.${b64url(
    JSON.stringify({ sub: 'u1', role: 'RECEPTION', loc }),
  )}.firma`;
};

it('un miembro acotado a sedes sin sede activa ve «Mis sedes» (DX-089)', async () => {
  mockedList.mockResolvedValueOnce(response());
  render(<CashRegisterView token={restrictedToken(['loc-1'])} />);
  expect(await screen.findByText('Mis sedes')).toBeInTheDocument();
  expect(screen.queryByText('Todas las sedes')).not.toBeInTheDocument();
});

it('muestra el estado vacío cuando el período no tiene abonos', async () => {
  mockedList.mockResolvedValue(
    response({
      items: [],
      total: 0,
      summary: { count: 0, byCurrency: [], byMethod: [], byPaymentMethod: [] },
    }),
  );
  render(<CashRegisterView token="tok" />);

  expect(await screen.findByText(/no hay abonos en este período/i)).toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: /resumen del período/i })).not.toBeInTheDocument();
});

it('si la carga falla, muestra el error de sección y reintenta al pulsar el botón', async () => {
  mockedList.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(response());
  const user = userEvent.setup();
  render(<CashRegisterView token="tok" />);

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent(/no pudimos cargar la caja/i);

  await user.click(within(alert).getByRole('button', { name: /reintentar/i }));

  expect(await screen.findByRole('table', { name: /abonos/i })).toBeInTheDocument();
  expect(mockedList).toHaveBeenCalledTimes(2);
});

// DX-063: un 500 no llega como «Internal server error», y un fallo de red dice
// que no hay conexión; los dos con reintento.
it('un 500 al cargar muestra texto en español con reintento', async () => {
  mockedList
    .mockRejectedValueOnce(new ApiError(500, 'Internal server error'))
    .mockResolvedValueOnce(response());
  const user = userEvent.setup();
  render(<CashRegisterView token="tok" />);

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('No pudimos cargar la caja.');
  expect(alert).not.toHaveTextContent(/internal server error/i);
  await user.click(within(alert).getByRole('button', { name: /reintentar/i }));
  expect(await screen.findByRole('table', { name: /abonos/i })).toBeInTheDocument();
});

it('sin conexión lo dice, con reintento', async () => {
  mockedList.mockRejectedValueOnce(new NetworkError(new TypeError('Failed to fetch'))).mockResolvedValueOnce(response());
  render(<CashRegisterView token="tok" />);
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent(/no hay conexión con el servidor/i);
  expect(within(alert).getByRole('button', { name: /reintentar/i })).toBeInTheDocument();
});

it('un 403 es un aviso de acceso, sin botón de reintentar (reintentar no cambia el rol)', async () => {
  mockedList.mockRejectedValue(new ApiError(403, 'Forbidden resource'));
  render(<CashRegisterView token="tok" />);

  const text = await screen.findByText(/tu rol no tiene acceso a la caja/i);
  expect(text.closest('[role="status"]')).not.toBeNull();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /reintentar/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('navigation', { name: /paginación/i })).not.toBeInTheDocument();
});

it('un 400 dice cuál es el problema en vez del error genérico', async () => {
  mockedList.mockRejectedValue(new ApiError(400, 'the period cannot exceed 366 days'));
  render(<CashRegisterView token="tok" />);

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent(/el período o el medio de pago no son válidos/i);
  expect(alert).not.toHaveTextContent(/no pudimos cargar la caja/i);
});

it('con un error de carga no deja la paginación de la respuesta anterior', async () => {
  mockedList.mockResolvedValueOnce(response({ total: 45 })).mockRejectedValueOnce(new Error('x'));
  const user = userEvent.setup();
  render(<CashRegisterView token="tok" />);
  expect(await screen.findByRole('button', { name: /siguiente/i })).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Esta semana' }));

  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /siguiente/i })).not.toBeInTheDocument();
});

it('la tabla lleva caption y cabeceras de columna', async () => {
  mockedList.mockResolvedValue(response());
  render(<CashRegisterView token="tok" />);

  const table = await screen.findByRole('table', { name: /abonos/i });
  // `DataList`: la tabla se nombra con `aria-label` (sin `<caption>` duplicado).
  expect(table).toHaveAccessibleName('Abonos del período');
  const headers = within(table).getAllByRole('columnheader');
  // 6 columnas de datos + «Acciones» (el «⋯» de cada fila: Recibo siempre).
  expect(headers.map((th) => th.textContent)).toEqual([
    'Fecha',
    'Paciente',
    'Destino',
    'Método',
    'Sede',
    'Monto',
    'Acciones',
  ]);
});

it('cambiar de período o de método vuelve a pedir la caja con el filtro nuevo, desde la página 1', async () => {
  mockedList.mockResolvedValue(response());
  const user = userEvent.setup();
  render(<CashRegisterView token="tok" />);
  await screen.findByRole('table', { name: /abonos/i });

  await user.click(screen.getByRole('button', { name: 'Esta semana' }));
  await waitFor(() =>
    expect(mockedList).toHaveBeenLastCalledWith('tok', {
      ...presetRange('week'),
      page: 1,
    }),
  );
  expect(screen.getByRole('button', { name: 'Esta semana' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // DX-395: por cualquier medio de la clínica, también los propios.
  const medium = screen.getByRole('combobox', { name: 'Medio de pago' });
  await within(medium).findByRole('option', { name: 'Pago móvil' });
  await user.selectOptions(medium, 'Pago móvil');
  await waitFor(() =>
    expect(mockedList).toHaveBeenLastCalledWith('tok', {
      ...presetRange('week'),
      paymentMethodId: 'pm-mobile',
      page: 1,
    }),
  );

  await user.click(screen.getByRole('button', { name: 'Este mes' }));
  await waitFor(() =>
    expect(mockedList).toHaveBeenLastCalledWith('tok', {
      ...presetRange('month'),
      paymentMethodId: 'pm-mobile',
      page: 1,
    }),
  );
});

describe('filtro por medio de pago (DX-395)', () => {
  it('ofrece todos los medios de la clínica, los inactivos marcados', async () => {
    mockedList.mockResolvedValue(response());
    render(<CashRegisterView token="tok" />);
    const medium = await screen.findByRole('combobox', { name: 'Medio de pago' });
    await within(medium).findByRole('option', { name: 'Pago móvil' });
    expect(within(medium).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Todos los medios',
      'Efectivo',
      'Pago móvil',
      'Cheque (inactivo)',
    ]);
    expect(mockedMethods).toHaveBeenCalledWith('tok', { includeInactive: true });
  });

  it('si los medios no cargan, el selector se sustituye por el error con reintento', async () => {
    mockedList.mockResolvedValue(response());
    mockedMethods.mockRejectedValueOnce(new Error('boom'));
    const user = userEvent.setup();
    render(<CashRegisterView token="tok" />);
    const status = await screen.findByText('No cargaron los medios');
    expect(status.closest('[role="status"]')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('combobox', { name: 'Medio de pago' })).toBeInTheDocument();
    // La caja sigue a la vista: falló un control, no la pantalla.
    expect(screen.getByRole('table', { name: /abonos/i })).toBeInTheDocument();
  });
});

describe('exportar la caja a CSV (DX-395)', () => {
  it('descarga el CSV del período y del medio elegidos', async () => {
    mockedList.mockResolvedValue(response());
    mockedCsv.mockResolvedValue('Fecha,Sede\r\n');
    const user = userEvent.setup();
    render(<CashRegisterView token="tok" />);
    await screen.findByRole('table', { name: /abonos/i });
    const medium = screen.getByRole('combobox', { name: 'Medio de pago' });
    await within(medium).findByRole('option', { name: 'Pago móvil' });
    await user.selectOptions(medium, 'Pago móvil');

    await user.click(screen.getByRole('button', { name: 'Exportar CSV' }));

    const today = presetRange('today');
    await waitFor(() =>
      expect(mockedCsv).toHaveBeenCalledWith('tok', { ...today, paymentMethodId: 'pm-mobile' }),
    );
    expect(mockedSaveCsv).toHaveBeenCalledWith('Fecha,Sede\r\n', `caja-${today.from}-${today.to}.csv`, {
      bom: true,
    });
    expect(await screen.findByText('Caja exportada.')).toBeInTheDocument();
  });

  it('si la descarga falla, lo avisa con reintento sin tocar la caja', async () => {
    mockedList.mockResolvedValue(response());
    mockedCsv.mockRejectedValueOnce(new Error('x'));
    const user = userEvent.setup();
    render(<CashRegisterView token="tok" />);
    await screen.findByRole('table', { name: /abonos/i });

    await user.click(screen.getByRole('button', { name: 'Exportar CSV' }));

    await waitFor(() =>
      expect(mockedNotify).toHaveBeenCalledWith(
        'No pudimos exportar la caja.',
        expect.objectContaining({ onRetry: expect.any(Function) as unknown }),
      ),
    );
    expect(screen.getByRole('table', { name: /abonos/i })).toBeInTheDocument();
    expect(mockedSaveCsv).not.toHaveBeenCalled();
  });
});

it('el rango personalizado pide las fechas elegidas y no consulta un rango invertido', async () => {
  mockedList.mockResolvedValue(response());
  const user = userEvent.setup();
  render(<CashRegisterView token="tok" />);
  await screen.findByRole('table', { name: /abonos/i });

  await user.click(screen.getByRole('button', { name: 'Personalizado' }));
  // `DateRangePicker` (UX v2): «Desde – Hasta» en un solo campo, por segmentos
  // dd/mm/aaaa; los tres primeros son «Desde» y los tres últimos «Hasta».
  const period = screen.getByRole('group', { name: 'Período personalizado' });
  const segments = () => within(period).getAllByRole('spinbutton');
  async function typeEnd(part: 'from' | 'to', ddmmyyyy: string) {
    await user.click(segments()[part === 'from' ? 0 : 3]);
    await user.keyboard(ddmmyyyy);
  }

  await typeEnd('from', '01092026');
  await typeEnd('to', '30092026');
  await waitFor(() =>
    expect(mockedList).toHaveBeenLastCalledWith('tok', {
      from: '2026-09-01',
      to: '2026-09-30',
      page: 1,
    }),
  );

  await screen.findByRole('table', { name: /abonos/i });
  const calls = mockedList.mock.calls.length;
  // Solo el mes de «Desde» (01/09 → 01/10): queda después de «Hasta».
  await user.click(segments()[1]);
  await user.keyboard('{ArrowUp}');
  const error = await screen.findByText(/la fecha final no puede ser anterior/i);
  expect(mockedList).toHaveBeenCalledTimes(calls);

  // El campo apunta al mensaje que lo explica.
  const errorId = error.closest('[id]')?.id;
  expect(errorId).toBeTruthy();
  expect(document.querySelector(`[aria-describedby~="${errorId}"]`)).not.toBeNull();

  // Y no se queda en pantalla el resultado de OTRO rango (el de septiembre)
  // como si respondiera al que está escrito.
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: /resumen del período/i })).not.toBeInTheDocument();
  expect(screen.queryByText(/^\d+ abonos?$/)).not.toBeInTheDocument();

  // Al corregirlo vuelve a pedir y a pintar.
  await user.click(segments()[1]);
  await user.keyboard('{ArrowDown}');
  await user.click(segments()[0]);
  await user.keyboard('10');
  await waitFor(() =>
    expect(mockedList).toHaveBeenLastCalledWith('tok', {
      from: '2026-09-10',
      to: '2026-09-30',
      page: 1,
    }),
  );
  expect(await screen.findByRole('table', { name: /abonos/i })).toBeInTheDocument();
});

it('pagina: "Siguiente" pide la página 2 con los mismos filtros', async () => {
  mockedList.mockResolvedValue(response({ total: 45 }));
  const user = userEvent.setup();
  render(<CashRegisterView token="tok" />);
  await screen.findByRole('table', { name: /abonos/i });

  await user.click(screen.getByRole('button', { name: /siguiente/i }));

  await waitFor(() =>
    expect(mockedList).toHaveBeenLastCalledWith('tok', {
      ...presetRange('today'),
      page: 2,
    }),
  );
});

it('cada fila abre el recibo de caja de su abono (DX-136)', async () => {
  const user = userEvent.setup();
  mockedList.mockResolvedValue(response());
  const mockedReceipt = getPaymentReceipt as jest.MockedFunction<typeof getPaymentReceipt>;
  mockedReceipt.mockResolvedValue(paymentReceiptFixture({ paymentId: 'pay-1', reference: 'PRI-000009' }));
  render(<CashRegisterView token="tok" />);

  const table = await screen.findByRole('table', { name: /abonos/i });
  const beto = within(table).getByRole('row', { name: /beto ruiz/i });
  // También en las filas que no se pueden anular.
  expect(await rowMenuItems(user, beto)).toContain('Recibo');
  const ana = within(table).getByRole('row', { name: /ana gómez/i });
  await pickRowAction(user, /ana gómez/, 'Recibo', ana);

  const dialog = await screen.findByRole('dialog', { name: /recibo de caja/i });
  expect(await within(dialog).findByTestId('receipt-document')).toHaveTextContent('N.º PRI-000009');
  expect(mockedReceipt).toHaveBeenCalledWith('tok', 'pay-1');
});

describe('anular desde la caja (DX-057)', () => {
  const REASON = 'Cobro registrado dos veces';

  it('enseña «Anular» solo en las filas que el servidor marca canVoid', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValue(response());
    render(<CashRegisterView token="tok" />);
    const table = await screen.findByRole('table', { name: /abonos/i });

    const ana = within(table).getByRole('row', { name: /ana gómez/i });
    expect(await rowMenuItems(user, ana)).toEqual(['Recibo', 'Anular']);
    const beto = within(table).getByRole('row', { name: /beto ruiz/i });
    expect(await rowMenuItems(user, beto)).toEqual(['Recibo']);
  });

  it('revisión DX-390: una forma de pago de un cobro dividido avisa que se anula el cobro entero', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValue(
      response({ items: [{ ...anaCash, splitId: 'pay-1', splitLines: 2 }], total: 1 }),
    );
    render(<CashRegisterView token="tok" />);
    await pickRowAction(user, /ana gómez/, 'Anular');
    const dialog = await screen.findByRole('dialog', { name: /anular este abono/i });
    expect(dialog).toHaveTextContent(
      'Es una de las 2 formas de pago de un mismo cobro: se anulan todas y su recibo.',
    );

    // QA DX-390 (B5): la confirmación dice que se anuló el cobro entero.
    mockedVoid.mockResolvedValue(undefined);
    await user.click(within(dialog).getByLabelText(/motivo/i));
    await user.paste(REASON);
    await user.click(within(dialog).getByRole('button', { name: /anular abono/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(
      await screen.findByText('Cobro anulado: 2 formas de pago y su recibo · 15/10/2026 · Ana Gómez.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/abono anulado/i)).not.toBeInTheDocument();
  });

  it('anula con motivo, cierra el modal, avisa y recarga la caja', async () => {
    const user = userEvent.setup();
    mockedList
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response({ items: [betoCard], total: 1 }));
    mockedVoid.mockResolvedValue(undefined);
    render(<CashRegisterView token="tok" />);

    await pickRowAction(user, /ana gómez/, 'Anular');
    const dialog = await screen.findByRole('dialog', {
      name: /anular este abono/i,
    });
    // Dice QUÉ abono se anula: monto, fecha y paciente.
    expect(money(dialog.textContent)).toMatch(/150\.000,50 COP · 15\/10\/2026 · Ana Gómez/);

    await user.click(within(dialog).getByLabelText(/motivo/i));
    await user.paste(REASON);
    await user.click(within(dialog).getByRole('button', { name: /anular abono/i }));

    await waitFor(() => expect(mockedVoid).toHaveBeenCalledWith('tok', 'pay-1', REASON));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText(/abono anulado/i)).toBeInTheDocument();
    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(2));
    const table = await screen.findByRole('table', { name: /abonos/i });
    await waitFor(() =>
      expect(within(table).queryByRole('row', { name: /ana gómez/i })).not.toBeInTheDocument(),
    );
  });

  it('un 403 o un 404 se explican en español dentro del modal, nunca en inglés', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValue(response());
    mockedVoid.mockRejectedValueOnce(new ApiError(403, 'Insufficient role'));
    mockedVoid.mockRejectedValueOnce(new ApiError(404, 'Payment not found'));
    render(<CashRegisterView token="tok" />);

    await pickRowAction(user, /ana gómez/, 'Anular');
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByLabelText(/motivo/i));
    await user.paste(REASON);
    const submit = within(dialog).getByRole('button', {
      name: /anular abono/i,
    });

    await user.click(submit);
    expect(await within(dialog).findByText(/no puedes anular este abono/i)).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent(/insufficient role/i);

    await user.click(submit);
    expect(
      await within(dialog).findByText(/ya estaba anulado o ya no existe/i),
    ).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent(/payment not found/i);
  });
});

describe('tras anular, la caja no se queda en una página vacía (DX-067)', () => {
  const REASON = 'Cobro registrado dos veces';

  it('anular la única fila de la última página vuelve a la página anterior', async () => {
    const user = userEvent.setup();
    const lastRow: CashPayment = { ...anaCash, id: 'pay-21', patient: { id: 'pat-9', fullName: 'Zoe Última' } };
    mockedList.mockImplementation((_token, params) => {
      if (params.page === 2) {
        // Tras anular, la página 2 ya no tiene filas: el total bajó a 20.
        return Promise.resolve(
          mockedVoid.mock.calls.length > 0
            ? response({ items: [], total: 20, page: 2 })
            : response({ items: [lastRow], total: 21, page: 2 }),
        );
      }
      return Promise.resolve(
        response({
          items: [anaCash, betoCard],
          total: mockedVoid.mock.calls.length > 0 ? 20 : 21,
          page: 1,
        }),
      );
    });
    mockedVoid.mockResolvedValue(undefined);
    render(<CashRegisterView token="tok" />);

    await user.click(await screen.findByRole('button', { name: /siguiente/i }));
    await pickRowAction(user, /zoe última/, 'Anular');
    const dialog = await screen.findByRole('dialog', {
      name: /anular este abono/i,
    });
    await user.click(within(dialog).getByLabelText(/motivo/i));
    await user.paste(REASON);
    await user.click(within(dialog).getByRole('button', { name: /anular abono/i }));

    await waitFor(() => expect(mockedVoid).toHaveBeenCalledWith('tok', 'pay-21', REASON));
    // Vuelve a pedir la página 1 y pinta sus filas, no el vacío de la 2.
    await waitFor(() =>
      expect(mockedList).toHaveBeenLastCalledWith('tok', expect.objectContaining({ page: 1 })),
    );
    const table = await screen.findByRole('table', { name: /abonos/i });
    expect(within(table).getByRole('row', { name: /ana gómez/i })).toBeInTheDocument();
    expect(screen.queryByText(/no hay abonos en este período/i)).not.toBeInTheDocument();
    expect(screen.getByText(/abono anulado/i)).toBeInTheDocument();
  });

  it('si la página sigue teniendo filas, se queda en ella', async () => {
    const user = userEvent.setup();
    mockedList.mockImplementation((_token, params) =>
      Promise.resolve(
        params.page === 2
          ? response({ items: [betoCard], total: 22, page: 2 })
          : response({ items: [anaCash], total: 22, page: 1 }),
      ),
    );
    render(<CashRegisterView token="tok" />);
    await user.click(await screen.findByRole('button', { name: /siguiente/i }));
    await waitFor(() =>
      expect(mockedList).toHaveBeenLastCalledWith('tok', expect.objectContaining({ page: 2 })),
    );
    const table = await screen.findByRole('table', { name: /abonos/i });
    expect(within(table).getByRole('row', { name: /beto ruiz/i })).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledTimes(2);
  });

  it('una página vacía con total 0 no rebota: es el estado vacío', async () => {
    mockedList.mockResolvedValue(
      response({
        items: [],
        total: 0,
        summary: { count: 0, byCurrency: [], byMethod: [], byPaymentMethod: [] },
      }),
    );
    render(<CashRegisterView token="tok" />);
    expect(await screen.findByText(/no hay abonos en este período/i)).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledTimes(1);
  });
});

describe('fecha de pago vs. fecha de registro (DX-067)', () => {
  it('dice «Registrado hoy» cuando el abono con fecha antigua se registró hoy', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValue(
      response({
        items: [
          { ...anaCash, paidAt: '2026-10-01T17:00:00.000Z', paidOn: '2026-10-01', registeredOn: '2026-10-16', registeredToday: true },
          { ...betoCard, paidAt: '2026-10-01T17:00:00.000Z', paidOn: '2026-10-01', registeredOn: '2026-10-12', registeredToday: false },
        ],
      }),
    );
    render(<CashRegisterView token="tok" />);
    const table = await screen.findByRole('table', { name: /abonos/i });

    const ana = within(table).getByRole('row', { name: /ana gómez/i });
    expect(within(ana).getByText('01/10/2026')).toBeInTheDocument();
    expect(within(ana).getByText('Registrado hoy')).toBeInTheDocument();
    // «Anular» sigue: la ventana mira el registro, y ahora se lee por qué.
    expect(await rowMenuItems(user, ana)).toContain('Anular');

    const beto = within(table).getByRole('row', { name: /beto ruiz/i });
    expect(within(beto).getByText('Registrado el 12/10/2026')).toBeInTheDocument();
  });

  it('no dice nada cuando la fecha de pago es la de registro', async () => {
    mockedList.mockResolvedValue(response({ items: [anaCash] }));
    render(<CashRegisterView token="tok" />);
    const table = await screen.findByRole('table', { name: /abonos/i });
    expect(within(table).queryByText(/registrado/i)).not.toBeInTheDocument();
  });
});

describe('días de la sede (DX-097)', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('«Hoy» es el día de la sede, no el del navegador: a las 22:30 de Bogotá (03:30Z del día siguiente) pide ese día', async () => {
    jest.useFakeTimers({
      now: new Date('2026-10-16T03:30:00.000Z'),
      advanceTimers: true,
    });
    mockedList.mockResolvedValue(response());
    render(<CashRegisterView token="tok" />);

    await waitFor(() =>
      expect(mockedList).toHaveBeenCalledWith('tok', {
        from: '2026-10-15',
        to: '2026-10-15',
        page: 1,
      }),
    );
    expect(mockedList).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId('cash-period-note')).toHaveTextContent(
      '15/10/2026 · días según la hora de la sede',
    );
  });

  it('con la sede en Madrid, «Hoy» es el día de Madrid', async () => {
    jest.useFakeTimers({
      now: new Date('2026-10-15T22:30:00.000Z'),
      advanceTimers: true,
    });
    mockedLocations.mockResolvedValue([
      clinicLocation({
        id: 'mad',
        name: 'Madrid',
        address: null,
        country: 'ES',
        isActive: true,
        currency: 'EUR',
        timeZone: 'Europe/Madrid',
        locale: 'es-ES',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    ]);
    mockedList.mockResolvedValue(response());
    render(<CashRegisterView token="tok" />);

    await waitFor(() =>
      expect(mockedList).toHaveBeenCalledWith('tok', {
        from: '2026-10-16',
        to: '2026-10-16',
        page: 1,
      }),
    );
  });

  it('no consulta la caja hasta saber la zona de la sede (muestra la carga)', async () => {
    let resolveLocations: (value: Awaited<ReturnType<typeof listLocations>>) => void = () => {};
    mockedLocations.mockReturnValue(new Promise((resolve) => (resolveLocations = resolve)));
    mockedList.mockResolvedValue(response());
    render(<CashRegisterView token="tok" />);

    expect(mockedList).not.toHaveBeenCalled();
    resolveLocations([clinicLocation()]);
    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(1));
    expect(mockedList).toHaveBeenCalledWith('tok', {
      ...presetRange('today'),
      page: 1,
    });
  });

  it('consumers render SedeConfigError without a zone', async () => {
    mockedLocations.mockResolvedValueOnce([clinicLocation({ timeZone: null })]);
    mockedList.mockResolvedValue(response());
    render(<CashRegisterView token="tok" />);

    expect(
      await screen.findByText('No se pudo saber la zona horaria de la sede. Vuelve a intentarlo.'),
    ).toBeInTheDocument();
    // Nunca se consulta «hoy» con otra zona (ni Bogotá ni la del navegador).
    expect(mockedList).not.toHaveBeenCalled();

    // Reintentar relee las sedes; ya configurada, la caja carga.
    mockedLocations.mockResolvedValueOnce([clinicLocation()]);
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(mockedList).toHaveBeenCalledWith('tok', { ...presetRange('today'), page: 1 }));
  });

  it('la fecha de cada fila es su día en la sede (paidOn): un abono de las 20:00 sale en su día', async () => {
    mockedList.mockResolvedValue(
      response({
        items: [
          {
            ...anaCash,
            paidAt: '2026-10-16T01:00:00.000Z',
            paidOn: '2026-10-15',
          },
        ],
      }),
    );
    render(<CashRegisterView token="tok" />);
    const table = await screen.findByRole('table', { name: /abonos/i });
    const row = within(table).getByRole('row', { name: /ana gómez/i });
    expect(within(row).getByText('15/10/2026')).toBeInTheDocument();
    expect(within(row).queryByText('16/10/2026')).not.toBeInTheDocument();
  });
});

it('DX-262: un abono contra el saldo migrado dice «Saldo migrado» y su concepto en vez del plan', async () => {
  mockedList.mockResolvedValue(
    response({
      items: [
        {
          ...anaCash,
          treatmentPlan: null,
          openingBalance: { id: 'ob-1', concept: 'Ortodoncia 2025' },
        },
      ],
    }),
  );
  render(<CashRegisterView token="tok" />);
  const table = await screen.findByRole('table', { name: /abonos/i });
  const row = within(table).getByRole('row', { name: /ana gómez/i });
  expect(within(row).getByText('Saldo migrado · Ortodoncia 2025')).toBeInTheDocument();
  // QA D2: la columna nombra el destino (un plan o un saldo migrado).
  expect(within(table).getByRole('columnheader', { name: 'Destino' })).toBeInTheDocument();
  expect(within(table).queryByRole('columnheader', { name: 'Plan' })).not.toBeInTheDocument();
});
