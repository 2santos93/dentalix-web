import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReceivablesView } from './receivables-view';
import {
  downloadReceivablesCsv,
  getReceivablesAging,
  type AgingRow,
  type ReceivablesAgingPage,
} from '@/lib/receivables/receivables-api';
import { fetchClinicName } from '@/lib/clinic-branding';
import { getTokenRole } from '@/lib/auth/token-role';
import { ApiError } from '@/lib/api/client';
import { notifyError } from '@/components/errors/notify';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../../lib/receivables/receivables-api', () => ({
  getReceivablesAging: jest.fn(),
  downloadReceivablesCsv: jest.fn(),
}));
jest.mock('../../lib/clinic-branding', () => ({ fetchClinicName: jest.fn() }));
jest.mock('../../lib/auth/token-role', () => ({ getTokenRole: jest.fn() }));
jest.mock('../errors/notify', () => ({ notifyError: jest.fn() }));
jest.mock('../../lib/appointments/staff-api', () => ({
  listStaff: jest.fn().mockResolvedValue([
    { userId: 'dr-1', fullName: 'Dra. Ríos', role: 'DENTIST' },
    { userId: 'rec-1', fullName: 'Rita', role: 'RECEPTION' },
  ]),
}));
jest.mock('../../lib/collections/collections-api', () => ({
  createCollectionNote: jest.fn().mockResolvedValue({ id: 'n1' }),
  createPaymentPromise: jest.fn(),
}));

const mockedAging = getReceivablesAging as jest.MockedFunction<typeof getReceivablesAging>;
const mockedCsv = downloadReceivablesCsv as jest.MockedFunction<typeof downloadReceivablesCsv>;
const mockedClinic = fetchClinicName as jest.MockedFunction<typeof fetchClinicName>;
const mockedRole = getTokenRole as jest.MockedFunction<typeof getTokenRole>;
const mockedNotify = notifyError as jest.MockedFunction<typeof notifyError>;

const BUCKETS = { current: 0, days0to30: 0, days31to60: 0, days61to90: 0, over90: 0 };

function row(overrides: Partial<AgingRow> = {}): AgingRow {
  return {
    patient: { id: 'pat-1', fullName: 'Ana Pérez', phone: '300 111 2222', whatsApp: '573001112222' },
    locationId: 'loc-1',
    oldestAgeDays: 120,
    ageApproximate: true,
    currencies: [
      {
        currency: 'COP',
        balance: 480000,
        debt: 500000,
        credit: 20000,
        buckets: { ...BUCKETS, over90: 500000 },
        oldestAgeDays: 120,
        ageApproximate: true,
        nextInstallment: null,
      },
    ],
    lastPayment: { paidOn: '2026-09-30', amount: 50000, currency: 'COP' },
    nextInstallment: null,
    lastNote: null,
    promise: null,
    ...overrides,
  };
}

function page(items: AgingRow[], overrides: Partial<ReceivablesAgingPage> = {}): ReceivablesAgingPage {
  return {
    asOf: '2026-10-17',
    scope: { location: { id: 'loc-1', name: 'Sede principal' } },
    items,
    total: items.length,
    page: 1,
    pageSize: 20,
    totals: items.length
      ? [
          {
            currency: 'COP',
            patients: items.length,
            balance: 480000,
            debt: 500000,
            credit: 20000,
            buckets: { ...BUCKETS, over90: 500000 },
          },
        ]
      : [],
    ...overrides,
  };
}

const money = (text: string | null | undefined) => (text ?? '').replace(/\s/g, ' ');

/** «Saldo mínimo», «Compromiso» y «Profesional» viven en «Más filtros». */
async function openMoreFilters(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^Más filtros/ }));
}

/** Las acciones de la fila están en su «⋯». */
async function openRowMenu(user: ReturnType<typeof userEvent.setup>, name = 'Ana Pérez') {
  await user.click(screen.getByRole('button', { name: `Acciones de ${name}` }));
}

describe('ReceivablesView (DX-145)', () => {
  beforeEach(() => {
    mockedAging.mockReset();
    mockedCsv.mockReset();
    mockedNotify.mockReset();
    mockedClinic.mockResolvedValue('Clínica Demo');
    mockedRole.mockReturnValue('RECEPTION');
  });

  it('pinta el esqueleto mientras carga', () => {
    mockedAging.mockReturnValue(new Promise(() => {}));
    render(<ReceivablesView token="tok" />);
    expect(screen.getByRole('status', { name: 'Cargando' })).toBeInTheDocument();
  });

  it('lista al deudor con antigüedad, fecha aproximada, deuda, saldo a favor, tramos y contacto', async () => {
    mockedAging.mockResolvedValue(page([row()]));
    render(<ReceivablesView token="tok" />);

    const table = await screen.findByRole('table');
    const tableRow = within(table).getByRole('row', { name: /Ana Pérez/ });
    expect(within(tableRow).getByText('120 días')).toBeInTheDocument();
    expect(within(tableRow).getAllByText('Más de 90 días').length).toBeGreaterThan(0);
    // La fecha aproximada: «*» en la fila (con texto para el lector) y UNA nota al pie.
    expect(within(tableRow).getByText('(fecha aproximada)')).toBeInTheDocument();
    expect(screen.getByText(/^\* Fecha aproximada: parte del saldo no está en cuotas/)).toBeInTheDocument();
    expect(money(tableRow.textContent)).toContain('500.000,00');
    expect(money(tableRow.textContent)).toContain('A favor: 20.000,00');
    expect(within(tableRow).getByText('30/09/2026')).toBeInTheDocument();
    expect(within(tableRow).getByRole('link', { name: 'Llamar a Ana Pérez: 300 111 2222' })).toHaveAttribute(
      'href',
      'tel:3001112222',
    );
    // Toda la fila abre el estado de cuenta (un enlace por fila, el del nombre).
    expect(within(tableRow).getByRole('link', { name: /^Ana Pérez/ })).toHaveAttribute(
      'href',
      '/patients/pat-1?tab=account-statement',
    );
    const whatsapp = within(tableRow).getByRole('link', { name: 'WhatsApp a Ana Pérez' });
    await waitFor(() => expect(whatsapp.getAttribute('href')).toContain('Cl%C3%ADnica%20Demo'));
    // Sin importes en el mensaje.
    expect(decodeURIComponent(whatsapp.getAttribute('href') ?? '')).not.toMatch(/\d{3}\.|COP|\$/);

    expect(screen.getByTestId('scope-marker')).toHaveTextContent('Sede principal');
    expect(screen.getByText('1 deudor')).toBeInTheDocument();
    expect(mockedAging).toHaveBeenCalledWith('tok', { page: 1 });
  });

  it('resume los totales por tramo y moneda', async () => {
    mockedAging.mockResolvedValue(page([row()]));
    render(<ReceivablesView token="tok" />);
    const summary = await screen.findByTestId('aging-total-COP');
    expect(money(summary.textContent)).toContain('1 deudor');
    expect(within(summary).getByText('Más de 90 días')).toBeInTheDocument();
    expect(money(summary.textContent)).toContain('Saldo a favor 20.000,00');
  });

  it('filtra por más de 90 días y vuelve a la página 1', async () => {
    mockedAging.mockResolvedValue(page([row()]));
    const user = userEvent.setup();
    render(<ReceivablesView token="tok" />);
    await screen.findByRole('table');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Antigüedad' }), 'Más de 90 días');
    await waitFor(() => expect(mockedAging).toHaveBeenLastCalledWith('tok', { minAgeDays: 91, page: 1 }));
  });

  it('aplica el saldo mínimo al dejar de teclear y ofrece las monedas vistas', async () => {
    mockedAging.mockResolvedValue(page([row()]));
    const user = userEvent.setup();
    render(<ReceivablesView token="tok" />);
    await screen.findByRole('table');
    await openMoreFilters(user);
    await user.type(screen.getByRole('textbox', { name: 'Saldo mínimo' }), '100000');
    await waitFor(() => expect(mockedAging).toHaveBeenLastCalledWith('tok', { minBalance: 100000, page: 1 }));
    expect(screen.getByRole('button', { name: 'Más filtros (1)' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Moneda' }), 'COP');
    await waitFor(() =>
      expect(mockedAging).toHaveBeenLastCalledWith('tok', { currency: 'COP', minBalance: 100000, page: 1 }),
    );
  });

  it('DX-241: el saldo mínimo se lee como cualquier importe («100.000» es cien mil); lo ambiguo no filtra', async () => {
    mockedAging.mockResolvedValue(page([row()]));
    const user = userEvent.setup();
    render(<ReceivablesView token="tok" />);
    await screen.findByRole('table');
    await openMoreFilters(user);
    const field = screen.getByRole('textbox', { name: 'Saldo mínimo' });
    await user.type(field, '100.000');
    await waitFor(() => expect(mockedAging).toHaveBeenLastCalledWith('tok', { minBalance: 100000, page: 1 }));
    await user.clear(field);
    await user.type(field, '1.00.000');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(mockedAging).toHaveBeenLastCalledWith('tok', { page: 1 }));
  });

  it('QA DX-241: un saldo mínimo que no se entiende dice por qué, enlazado al campo', async () => {
    mockedAging.mockResolvedValue(page([row()]));
    const user = userEvent.setup();
    render(<ReceivablesView token="tok" />);
    await screen.findByRole('table');
    await openMoreFilters(user);
    const field = screen.getByRole('textbox', { name: 'Saldo mínimo' });
    await user.type(field, '1.50.0');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    const errorId = field.getAttribute('aria-describedby') ?? '';
    const error = document.getElementById(errorId);
    expect(error).toBeVisible();
    expect(error).toHaveTextContent(/No sabemos leer «1\.50\.0»/);
    expect(error).toHaveTextContent(/no se filtra por saldo/);
    await user.clear(field);
    await user.type(field, '100.000');
    expect(field).not.toHaveAttribute('aria-invalid');
    expect(field).not.toHaveAttribute('aria-describedby');
    expect(document.getElementById(errorId)).toBeNull();
  });

  it('vacío: «No hay saldos vencidos en esta sede»', async () => {
    mockedAging.mockResolvedValue(page([]));
    render(<ReceivablesView token="tok" />);
    expect(await screen.findByText('No hay saldos vencidos en esta sede')).toBeInTheDocument();
  });

  it('error con «Reintentar» que vuelve a pedir la lista', async () => {
    mockedAging.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(page([row()]));
    const user = userEvent.setup();
    render(<ReceivablesView token="tok" />);
    expect(await screen.findByText('No pudimos cargar la cartera.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(mockedAging).toHaveBeenCalledTimes(2);
  });

  it('403: aviso en español sin reintentar ni exportar', async () => {
    mockedRole.mockReturnValue('ADMIN');
    mockedAging.mockRejectedValue(new ApiError(403, 'Tu rol no tiene acceso a la cartera'));
    render(<ReceivablesView token="tok" />);
    expect(await screen.findByText('Tu rol no tiene acceso a la cartera.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Exportar CSV' })).not.toBeInTheDocument();
    // Sin filtros que no llevan a nada: el rol no puede ver ninguna fila.
    expect(screen.queryByRole('combobox', { name: 'Antigüedad' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Saldo mínimo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Moneda' })).not.toBeInTheDocument();
  });

  it('«Exportar CSV» solo para ADMIN, con los filtros activos', async () => {
    mockedAging.mockResolvedValue(page([row()]));
    const { unmount } = render(<ReceivablesView token="tok" />);
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: 'Exportar CSV' })).not.toBeInTheDocument();
    unmount();

    mockedRole.mockReturnValue('ADMIN');
    mockedCsv.mockResolvedValue('\uFEFFPaciente');
    const createUrl = jest.fn(() => 'blob:x');
    const revoke = jest.fn();
    Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: revoke });
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const user = userEvent.setup();
    render(<ReceivablesView token="tok" />);
    await screen.findByRole('table');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Antigüedad' }), 'Más de 30 días');
    await waitFor(() => expect(mockedAging).toHaveBeenLastCalledWith('tok', { minAgeDays: 31, page: 1 }));
    await user.click(await screen.findByRole('button', { name: 'Exportar CSV' }));
    await waitFor(() => expect(mockedCsv).toHaveBeenCalledWith('tok', { minAgeDays: 31 }));
    expect(click).toHaveBeenCalled();
    expect(await screen.findByText('Cartera exportada.')).toBeInTheDocument();
    click.mockRestore();
  });

  it('si la exportación falla, avisa con un toast que reintenta (la lista sigue)', async () => {
    mockedRole.mockReturnValue('ADMIN');
    mockedAging.mockResolvedValue(page([row()]));
    mockedCsv.mockRejectedValue(new ApiError(403, 'Solo la administración puede exportar la cartera.'));
    const user = userEvent.setup();
    render(<ReceivablesView token="tok" />);
    await user.click(await screen.findByRole('button', { name: 'Exportar CSV' }));
    await waitFor(() => expect(mockedNotify).toHaveBeenCalled());
    expect(mockedNotify.mock.calls[0][1]?.onRetry).toEqual(expect.any(Function));
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  describe('cobranza (DX-150)', () => {
    it('la fila muestra la última gestión y el compromiso con su estado', async () => {
      mockedAging.mockResolvedValue(
        page([
          row({
            lastNote: { channel: 'CALL', outcome: 'PROMISED_PAYMENT', createdAt: '2026-10-16T15:00:00.000Z' },
            promise: { id: 'pp1', amount: 200000, currency: 'COP', dueDate: '2026-11-15', status: 'KEPT', reopenedAt: null },
          }),
        ]),
      );
      render(<ReceivablesView token="tok" />);
      const table = await screen.findByRole('table');
      const tableRow = within(table).getByRole('row', { name: /Ana Pérez/ });
      // Con compromiso, la celda dice el compromiso; la gestión está en el estado de cuenta.
      expect(within(tableRow).queryByText('Llamada · Promete pago')).toBeNull();
      expect(within(tableRow).getByText('Cumplido')).toBeInTheDocument();
      expect(money(tableRow.textContent)).toContain('para el 15/11/2026');
    });

    it('DX-215: un compromiso reabierto al anular su abono sale Abierto y con el motivo', async () => {
      mockedAging.mockResolvedValue(
        page([
          row({
            promise: {
              id: 'pp1',
              amount: 200000,
              currency: 'COP',
              dueDate: '2026-11-15',
              status: 'OPEN',
              reopenedAt: '2026-10-17T15:00:00.000Z',
            },
          }),
        ]),
      );
      render(<ReceivablesView token="tok" />);
      const table = await screen.findByRole('table');
      const tableRow = within(table).getByRole('row', { name: /Ana Pérez/ });
      expect(within(tableRow).getByText('Abierto')).toBeInTheDocument();
      expect(within(tableRow).getByText('Reabierto: se anuló el abono')).toBeInTheDocument();
    });

    it('DX-215: reabierto y cumplido de nuevo: no dice «Reabierto» junto a «Cumplido»', async () => {
      mockedAging.mockResolvedValue(
        page([
          row({
            promise: {
              id: 'pp1',
              amount: 200000,
              currency: 'COP',
              dueDate: '2026-11-15',
              status: 'KEPT',
              reopenedAt: '2026-10-17T15:00:00.000Z',
            },
          }),
        ]),
      );
      render(<ReceivablesView token="tok" />);
      const table = await screen.findByRole('table');
      const tableRow = within(table).getByRole('row', { name: /Ana Pérez/ });
      expect(within(tableRow).getByText('Cumplido')).toBeInTheDocument();
      expect(within(tableRow).queryByText('Reabierto: se anuló el abono')).toBeNull();
    });

    it('«Registrar gestión» (en el «⋯») abre el modal y al guardar recarga la cartera', async () => {
      mockedAging.mockResolvedValue(page([row()]));
      const user = userEvent.setup();
      render(<ReceivablesView token="tok" />);
      await screen.findByRole('table');
      await openRowMenu(user);
      await user.click(await screen.findByRole('menuitem', { name: 'Registrar gestión' }));
      const dialog = await screen.findByRole('dialog', { name: 'Registrar gestión' });
      await userEvent.selectOptions(within(dialog).getByLabelText('Canal'), 'CALL');
      await userEvent.selectOptions(within(dialog).getByLabelText('Resultado'), 'NO_ANSWER');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar gestión' }));
      expect(await screen.findByText('Gestión registrada para Ana Pérez.')).toBeInTheDocument();
      await waitFor(() => expect(mockedAging).toHaveBeenCalledTimes(2));
    });

    it('con un compromiso abierto no ofrece otro', async () => {
      mockedAging.mockResolvedValue(
        page([row({ promise: { id: 'pp1', amount: 1, currency: 'COP', dueDate: '2026-11-15', status: 'OPEN', reopenedAt: null } })]),
      );
      render(<ReceivablesView token="tok" />);
      const table = await screen.findByRole('table');
      expect(within(table).getByText('Abierto')).toBeInTheDocument();
      await openRowMenu(userEvent.setup());
      expect(await screen.findByRole('menuitem', { name: 'Registrar gestión' })).toBeInTheDocument();
      expect(screen.queryByRole('menuitem', { name: 'Compromiso de pago' })).toBeNull();
    });

    it('filtra por compromiso abierto y por profesional', async () => {
      mockedAging.mockResolvedValue(page([row()]));
      const user = userEvent.setup();
      render(<ReceivablesView token="tok" />);
      await screen.findByRole('table');
      await openMoreFilters(user);
      await userEvent.selectOptions(screen.getByLabelText('Compromiso'), 'yes');
      await waitFor(() =>
        expect(mockedAging).toHaveBeenLastCalledWith('tok', expect.objectContaining({ hasPromise: true })),
      );
      const provider = await screen.findByLabelText('Profesional');
      expect(within(provider).queryByText('Rita')).toBeNull();
      await userEvent.selectOptions(provider, 'dr-1');
      await waitFor(() =>
        expect(mockedAging).toHaveBeenLastCalledWith(
          'tok',
          expect.objectContaining({ providerId: 'dr-1', hasPromise: true }),
        ),
      );
    });
  });

  it('sin compromiso, la celda de gestión dice la última gestión', async () => {
    mockedAging.mockResolvedValue(
      page([row({ lastNote: { channel: 'CALL', outcome: 'PROMISED_PAYMENT', createdAt: '2026-10-16T15:00:00.000Z' } })]),
    );
    render(<ReceivablesView token="tok" />);
    const tableRow = within(await screen.findByRole('table')).getByRole('row', { name: /Ana Pérez/ });
    expect(within(tableRow).getByText('Llamada · Promete pago')).toBeInTheDocument();
  });

  describe('teléfono (<640px)', () => {
    let original: typeof window.matchMedia;
    beforeEach(() => {
      original = window.matchMedia;
      window.matchMedia = ((query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      })) as unknown as typeof window.matchMedia;
    });
    afterEach(() => {
      window.matchMedia = original;
    });

    it('cada deudor es una tarjeta que abre su estado de cuenta; Llamar y WhatsApp van en el «⋯»', async () => {
      mockedAging.mockResolvedValue(page([row()]));
      const open = jest.spyOn(window, 'open').mockImplementation(() => null);
      const user = userEvent.setup();
      render(<ReceivablesView token="tok" />);
      const list = await screen.findByRole('list', { name: 'Deudores' });
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      const card = within(list).getByRole('link', { name: /Ana Pérez/ });
      expect(card).toHaveAttribute('href', '/patients/pat-1?tab=account-statement');
      expect(money(card.textContent)).toContain('500.000,00');
      expect(card).toHaveTextContent('Más de 90 días');
      await waitFor(() => expect(mockedClinic).toHaveBeenCalled());
      await openRowMenu(user);
      expect(await screen.findByRole('menuitem', { name: 'Llamar al 300 111 2222' })).toBeInTheDocument();
      await user.click(screen.getByRole('menuitem', { name: 'WhatsApp' }));
      expect(open).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/wa\.me\/573001112222\?text=/), '_blank', 'noopener,noreferrer');
      const text = decodeURIComponent(String(open.mock.calls[0][0]).split('?text=')[1]);
      expect(text).not.toMatch(/\d|COP|\$/);
      open.mockRestore();
    });
  });

  it('una moneda sin nada por cobrar no pinta cinco tramos a cero', async () => {
    mockedAging.mockResolvedValue(
      page([row()], {
        totals: [
          { currency: 'USD', patients: 1, balance: -50, debt: 0, credit: 50, buckets: { ...BUCKETS } },
        ],
      }),
    );
    render(<ReceivablesView token="tok" />);
    const summary = await screen.findByTestId('aging-total-USD');
    expect(within(summary).queryByText('Por vencer')).toBeNull();
    expect(money(summary.textContent)).toContain('Saldo a favor 50,00');
  });
});
