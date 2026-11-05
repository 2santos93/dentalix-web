import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UnallocatedPaymentsView } from './unallocated-payments-view';
import { UNALLOCATED_PAGE_SIZE } from './use-unallocated-payments';
import {
  downloadUnallocatedPaymentsCsv,
  getUnallocatedPayments,
  type UnallocatedPaymentRow,
  type UnallocatedPaymentsPage,
} from '@/lib/reports/unallocated-payments-api';
import { ApiError } from '@/lib/api/client';
import { saveCsv } from '@/lib/files/save-csv';
import { notifyError } from '@/components/errors/notify';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';

jest.mock('../../lib/reports/unallocated-payments-api', () => ({
  getUnallocatedPayments: jest.fn(),
  downloadUnallocatedPaymentsCsv: jest.fn(),
}));
jest.mock('../../lib/files/save-csv', () => ({ saveCsv: jest.fn() }));
jest.mock('../errors/notify', () => ({ notifyError: jest.fn() }));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
jest.mock('../../lib/locations/use-sede-time-zone', () => ({
  ...jest.requireActual('../../lib/locations/use-sede-time-zone'),
  useSedeTimeZone: jest.fn(() => ({ status: 'ready', timeZone: 'America/Caracas' })),
  sedeToday: () => '2026-10-24',
}));

const mockedGet = getUnallocatedPayments as jest.MockedFunction<typeof getUnallocatedPayments>;
const mockedCsv = downloadUnallocatedPaymentsCsv as jest.MockedFunction<typeof downloadUnallocatedPaymentsCsv>;
const mockedSave = saveCsv as jest.MockedFunction<typeof saveCsv>;
const mockedNotify = notifyError as jest.MockedFunction<typeof notifyError>;

const flat = (text: string | null | undefined) => (text ?? '').replace(/\s/g, ' ');

function row(overrides: Partial<UnallocatedPaymentRow> = {}): UnallocatedPaymentRow {
  return {
    paymentId: 'pay-1',
    patient: { id: 'pat-1', fullName: 'Ana Pérez' },
    location: { id: 'loc-1', name: 'Sede principal' },
    paidOn: '2026-10-20',
    paymentAmount: 130,
    paymentCurrency: 'USD',
    planId: 'plan-1',
    planCurrency: 'USD',
    allocated: 100,
    unallocated: 30,
    ...overrides,
  };
}

function page(items: UnallocatedPaymentRow[], overrides: Partial<UnallocatedPaymentsPage> = {}): UnallocatedPaymentsPage {
  return {
    from: '2026-10-01',
    to: '2026-10-24',
    filters: { locationId: null, locationName: null },
    options: {
      locations: [
        { id: 'loc-1', name: 'Sede principal', isActive: true },
        { id: 'loc-2', name: 'Sede Norte', isActive: true },
      ],
    },
    items,
    total: items.length,
    page: 1,
    pageSize: UNALLOCATED_PAGE_SIZE,
    totals: [{ currency: 'USD', count: items.length, allocated: 100, unallocated: 30 }],
    paymentsWithoutRateCount: 0,
    ...overrides,
  };
}

describe('UnallocatedPaymentsView (DX-399)', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedCsv.mockReset();
    mockedSave.mockReset();
    mockedNotify.mockReset();
    jest.mocked(listLocations).mockResolvedValue([clinicLocation()]);
  });

  it('pinta el esqueleto mientras carga', () => {
    mockedGet.mockReturnValue(new Promise(() => {}));
    render(<UnallocatedPaymentsView token="tok" />);
    expect(screen.getByRole('status', { name: 'Cargando' })).toBeInTheDocument();
  });

  it('lista paciente, sede, fecha, abono, imputado y sin imputar con código ISO, y enlaza al estado de cuenta', async () => {
    mockedGet.mockResolvedValue(page([row()]));
    render(<UnallocatedPaymentsView token="tok" />);

    const table = await screen.findByRole('table');
    const tableRow = within(table).getByRole('row', { name: /Ana Pérez/ });
    const text = flat(tableRow.textContent);
    expect(text).toContain('USD 130,00');
    expect(text).toContain('USD 100,00');
    expect(text).toContain('USD 30,00');
    expect(within(tableRow).getByText('Sede principal')).toBeInTheDocument();
    expect(within(tableRow).getByText('20/10/2026')).toBeInTheDocument();
    expect(within(tableRow).getByRole('link', { name: /^Ana Pérez/ })).toHaveAttribute(
      'href',
      '/patients/pat-1?tab=account-statement',
    );
    // Totales por moneda sobre todo el alcance y las columnas pedidas.
    for (const header of ['Paciente', 'Sede', 'Fecha del abono', 'Importe del abono', 'Imputado', 'Sin imputar']) {
      expect(within(table).getByRole('columnheader', { name: header })).toBeInTheDocument();
    }
    expect(screen.getByText('1 abono')).toBeInTheDocument();
    // El período por defecto: este mes, hasta «hoy» en la zona de la sede.
    expect(mockedGet).toHaveBeenCalledWith(
      'tok',
      { from: '2026-10-01', to: '2026-10-24' },
      { page: 1, pageSize: UNALLOCATED_PAGE_SIZE },
    );
  });

  it('cada importe y fecha usa el formato de SU sede, no el de la pantalla', async () => {
    jest
      .mocked(listLocations)
      .mockResolvedValue([
        clinicLocation({ id: 'loc-1', name: 'Sede principal', locale: 'es-VE' }),
        clinicLocation({ id: 'loc-2', name: 'Sede Miami', locale: 'en-US', currency: 'USD' }),
      ]);
    mockedGet.mockResolvedValue(
      page([
        row({ paymentId: 'a', paymentAmount: 1234.5, unallocated: 1234.5 }),
        row({
          paymentId: 'b',
          patient: { id: 'pat-2', fullName: 'Beto Ruiz' },
          location: { id: 'loc-2', name: 'Sede Miami' },
          paymentAmount: 1234.5,
          unallocated: 1234.5,
        }),
      ]),
    );
    render(<UnallocatedPaymentsView token="tok" />);
    const ana = await screen.findByRole('row', { name: /Ana Pérez/ });
    const beto = screen.getByRole('row', { name: /Beto Ruiz/ });
    expect(flat(ana.textContent)).toContain('USD 1.234,50');
    expect(flat(beto.textContent)).toContain('USD 1,234.50');
    expect(within(ana).getByText('20/10/2026')).toBeInTheDocument();
    expect(within(beto).getByText('10/20/2026')).toBeInTheDocument();
  });

  it('un abono en VES a un plan en USD muestra cada importe en su moneda', async () => {
    mockedGet.mockResolvedValue(page([row({ paymentAmount: 4000, paymentCurrency: 'VES', unallocated: 30 })]));
    render(<UnallocatedPaymentsView token="tok" />);
    const tableRow = await screen.findByRole('row', { name: /Ana Pérez/ });
    const text = flat(tableRow.textContent);
    expect(text).toContain('VES 4.000,00');
    expect(text).toContain('USD 30,00');
  });

  it('vacío: «No hay cobros sin imputar en este período» y sin «Cargar más»', async () => {
    mockedGet.mockResolvedValue(page([], { totals: [] }));
    render(<UnallocatedPaymentsView token="tok" />);
    expect(await screen.findByText('No hay cobros sin imputar en este período')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
  });

  it('error con «Reintentar» que vuelve a pedir la primera página', async () => {
    mockedGet.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(page([row()]));
    const user = userEvent.setup();
    render(<UnallocatedPaymentsView token="tok" />);
    expect(await screen.findByText('No pudimos cargar lo cobrado sin imputar.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('403 sin sede elegida: aviso de rol sin acceso', async () => {
    mockedGet.mockRejectedValue(new ApiError(403, 'Insufficient role'));
    render(<UnallocatedPaymentsView token="tok" />);
    expect(await screen.findByText('Tu rol no tiene acceso a lo cobrado sin imputar.')).toBeInTheDocument();
  });

  it('«Cargar más» añade la siguiente página sin repetir filas', async () => {
    const first = Array.from({ length: UNALLOCATED_PAGE_SIZE }, (_, i) =>
      row({ paymentId: `p${i}`, patient: { id: `u${i}`, fullName: `Paciente ${i}` } }),
    );
    mockedGet.mockResolvedValueOnce(page(first, { total: UNALLOCATED_PAGE_SIZE + 1 }));
    mockedGet.mockResolvedValueOnce(
      page([row({ paymentId: 'p-last', patient: { id: 'last', fullName: 'Última Paciente' } })], {
        total: UNALLOCATED_PAGE_SIZE + 1,
        page: 2,
      }),
    );
    const user = userEvent.setup();
    render(<UnallocatedPaymentsView token="tok" />);
    await user.click(await screen.findByRole('button', { name: 'Cargar más' }));
    expect(await screen.findByRole('row', { name: /Última Paciente/ })).toBeInTheDocument();
    expect(mockedGet).toHaveBeenLastCalledWith('tok', expect.any(Object), { page: 2, pageSize: UNALLOCATED_PAGE_SIZE });
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
  });

  it('cambiar de sede vuelve a pedir con locationId', async () => {
    mockedGet.mockResolvedValue(page([row()]));
    const user = userEvent.setup();
    render(<UnallocatedPaymentsView token="tok" />);
    await screen.findByRole('table');
    await waitFor(() => expect(screen.getByLabelText('Sede del abono')).not.toBeDisabled());
    await user.selectOptions(screen.getByLabelText('Sede del abono'), 'loc-2');
    await waitFor(() =>
      expect(mockedGet).toHaveBeenLastCalledWith(
        'tok',
        { from: '2026-10-01', to: '2026-10-24', locationId: 'loc-2' },
        { page: 1, pageSize: UNALLOCATED_PAGE_SIZE },
      ),
    );
  });

  it('avisa de los abonos sin tasa, que no están en la lista', async () => {
    mockedGet.mockResolvedValue(page([row()], { paymentsWithoutRateCount: 2 }));
    render(<UnallocatedPaymentsView token="tok" />);
    expect(await screen.findByText(/No están en la lista: es un abono en otra moneda que la del plan y falta la tasa de cambio de su día/)).toBeInTheDocument();
  });

  it('exporta el CSV con los mismos filtros y avisa del resultado', async () => {
    mockedGet.mockResolvedValue(page([row()]));
    mockedCsv.mockResolvedValue('csv');
    const user = userEvent.setup();
    render(<UnallocatedPaymentsView token="tok" />);
    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    await waitFor(() => expect(mockedSave).toHaveBeenCalled());
    expect(mockedCsv).toHaveBeenCalledWith('tok', { from: '2026-10-01', to: '2026-10-24' });
    expect(mockedSave).toHaveBeenCalledWith('csv', 'cobrado-sin-imputar-2026-10-01-2026-10-24.csv', { bom: true });
    expect(await screen.findByText('Reporte exportado.')).toBeInTheDocument();
  });

  it('un CSV que falla avisa con reintento', async () => {
    mockedGet.mockResolvedValue(page([row()]));
    mockedCsv.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    render(<UnallocatedPaymentsView token="tok" />);
    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    await waitFor(() =>
      expect(mockedNotify).toHaveBeenCalledWith('No pudimos exportar el reporte.', expect.objectContaining({ onRetry: expect.any(Function) })),
    );
  });
});
