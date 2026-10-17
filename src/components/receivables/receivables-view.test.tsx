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

  it('lista al deudor con antigüedad, fecha aproximada, deuda, saldo a favor, tramos y acciones', async () => {
    mockedAging.mockResolvedValue(page([row()]));
    render(<ReceivablesView token="tok" />);

    const table = await screen.findByRole('table');
    const tableRow = within(table).getByRole('row', { name: /Ana Pérez/ });
    expect(within(tableRow).getByText('120 días')).toBeInTheDocument();
    expect(within(tableRow).getAllByText('Más de 90 días').length).toBeGreaterThan(0);
    expect(within(tableRow).getByText('Fecha aproximada')).toBeInTheDocument();
    expect(money(tableRow.textContent)).toContain('500.000,00');
    expect(money(tableRow.textContent)).toContain('A favor: 20.000,00');
    expect(within(tableRow).getByText('30/09/2026')).toBeInTheDocument();
    expect(within(tableRow).getByRole('link', { name: 'Llamar a Ana Pérez: 300 111 2222' })).toHaveAttribute(
      'href',
      'tel:3001112222',
    );
    expect(within(tableRow).getByRole('link', { name: 'Estado de cuenta de Ana Pérez' })).toHaveAttribute(
      'href',
      '/patients/pat-1?tab=account-statement',
    );
    const whatsapp = within(tableRow).getByRole('link', { name: 'WhatsApp a Ana Pérez' });
    await waitFor(() => expect(whatsapp.getAttribute('href')).toContain('Cl%C3%ADnica%20Demo'));
    // Sin importes en el mensaje.
    expect(decodeURIComponent(whatsapp.getAttribute('href') ?? '')).not.toMatch(/\d{3}\.|COP|\$/);

    expect(screen.getByText('Deudas de Sede principal')).toBeInTheDocument();
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
    await user.type(screen.getByRole('textbox', { name: 'Saldo mínimo' }), '100000');
    await waitFor(() => expect(mockedAging).toHaveBeenLastCalledWith('tok', { minBalance: 100000, page: 1 }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Moneda' }), 'COP');
    await waitFor(() =>
      expect(mockedAging).toHaveBeenLastCalledWith('tok', { currency: 'COP', minBalance: 100000, page: 1 }),
    );
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
            promise: { id: 'pp1', amount: 200000, currency: 'COP', dueDate: '2026-11-15', status: 'KEPT' },
          }),
        ]),
      );
      render(<ReceivablesView token="tok" />);
      const table = await screen.findByRole('table');
      const tableRow = within(table).getByRole('row', { name: /Ana Pérez/ });
      expect(within(tableRow).getByText('Llamada · Promete pago')).toBeInTheDocument();
      expect(within(tableRow).getByText('Cumplido')).toBeInTheDocument();
      expect(money(tableRow.textContent)).toContain('para el 15/11/2026');
    });

    it('«Gestión» abre el modal «Registrar gestión» y al guardar recarga la cartera', async () => {
      mockedAging.mockResolvedValue(page([row()]));
      render(<ReceivablesView token="tok" />);
      const table = await screen.findByRole('table');
      await userEvent.click(
        within(table).getByRole('button', { name: 'Registrar gestión de cobro con Ana Pérez' }),
      );
      const dialog = await screen.findByRole('dialog', { name: 'Registrar gestión' });
      await userEvent.selectOptions(within(dialog).getByLabelText('Canal'), 'CALL');
      await userEvent.selectOptions(within(dialog).getByLabelText('Resultado'), 'NO_ANSWER');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar gestión' }));
      expect(await screen.findByText('Gestión registrada para Ana Pérez.')).toBeInTheDocument();
      await waitFor(() => expect(mockedAging).toHaveBeenCalledTimes(2));
    });

    it('con un compromiso abierto no ofrece otro', async () => {
      mockedAging.mockResolvedValue(
        page([row({ promise: { id: 'pp1', amount: 1, currency: 'COP', dueDate: '2026-11-15', status: 'OPEN' } })]),
      );
      render(<ReceivablesView token="tok" />);
      const table = await screen.findByRole('table');
      expect(within(table).queryByRole('button', { name: 'Compromiso de pago de Ana Pérez' })).toBeNull();
      expect(within(table).getByText('Abierto')).toBeInTheDocument();
    });

    it('filtra por compromiso abierto y por profesional', async () => {
      mockedAging.mockResolvedValue(page([row()]));
      render(<ReceivablesView token="tok" />);
      await screen.findByRole('table');
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
});
