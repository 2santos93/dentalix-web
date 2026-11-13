import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfitabilityView } from './profitability-view';
import {
  downloadProfitabilityCsv,
  getProfitability,
  getProfitabilityLines,
  type ProfitabilityCurrency,
  type ProfitabilityDefinition,
  type ProfitabilityReport,
} from '@/lib/reports/profitability-api';
import { ApiError } from '@/lib/api/client';
import { saveCsv } from '@/lib/files/save-csv';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';
import { regionalFormat } from '@/lib/format/regional-format';
import { useSedeFormat } from '@/lib/locations/use-sede-format';

let search = new URLSearchParams('tab=rentabilidad');
const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/reportes',
  useSearchParams: () => search,
}));
jest.mock('../../lib/reports/profitability-api', () => ({
  ...jest.requireActual('../../lib/reports/profitability-api'),
  getProfitability: jest.fn(),
  getProfitabilityLines: jest.fn(),
  downloadProfitabilityCsv: jest.fn(),
}));
jest.mock('../../lib/files/save-csv', () => ({ saveCsv: jest.fn() }));
jest.mock('../errors/notify', () => ({ notifyError: jest.fn() }));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
jest.mock('../../lib/locations/use-sede-time-zone', () => ({
  ...jest.requireActual('../../lib/locations/use-sede-time-zone'),
  useSedeTimeZone: jest.fn(() => ({ status: 'ready', timeZone: 'America/Caracas' })),
  sedeToday: () => '2026-11-12',
}));
jest.mock('../../lib/locations/use-sede-format', () => ({
  ...jest.requireActual('../../lib/locations/use-sede-format'),
  useSedeFormat: jest.fn(),
}));

const mockedGet = getProfitability as jest.MockedFunction<typeof getProfitability>;
const mockedLines = getProfitabilityLines as jest.MockedFunction<typeof getProfitabilityLines>;
const mockedCsv = downloadProfitabilityCsv as jest.MockedFunction<typeof downloadProfitabilityCsv>;
const mockedSave = saveCsv as jest.MockedFunction<typeof saveCsv>;
const flat = (text: string | null | undefined) => (text ?? '').replace(/\s/g, ' ');

const CASH: ProfitabilityDefinition = {
  basis: 'CASH',
  label: 'Caja',
  incomeLabel: 'Cobrado',
  expensesLabel: 'Gastos pagados',
  formula: 'Resultado = cobrado − gastos pagados, por fecha de pago.',
  howItIsCalculated: ['Cobrado: los abonos no anulados.', 'Cada moneda va por separado y sin convertir.'],
};
const ACCRUAL: ProfitabilityDefinition = {
  basis: 'ACCRUAL',
  label: 'Devengo',
  incomeLabel: 'Producción realizada',
  expensesLabel: 'Gastos facturados',
  formula: 'Resultado = producción realizada − gastos por fecha de factura, pagados o no.',
  howItIsCalculated: ['Producción realizada: precio neto.'],
};

function usd(overrides: Partial<ProfitabilityCurrency> = {}): ProfitabilityCurrency {
  return {
    currency: 'USD',
    income: 1500,
    incomeCount: 12,
    expenses: 600,
    expenseCount: 3,
    net: 900,
    margin: 60,
    categories: [
      { category: 'Laboratorio', amount: 400, count: 2 },
      { category: 'Insumos clínicos', amount: 200, count: 1 },
    ],
    ...overrides,
  };
}

function report(overrides: Partial<ProfitabilityReport> = {}): ProfitabilityReport {
  return {
    from: '2026-11-01',
    to: '2026-11-12',
    basis: 'CASH',
    definition: CASH,
    locationId: null,
    restrictedToLocations: false,
    hasActivity: true,
    locations: [
      { locationId: 'loc-1', name: 'Sede Chacao', isActive: true, timeZone: 'America/Caracas', currencies: [usd()] },
      {
        locationId: 'loc-2',
        name: 'Sede Valencia',
        isActive: false,
        timeZone: 'America/Caracas',
        currencies: [
          usd({ income: 100, incomeCount: 1, expenses: 300, expenseCount: 1, net: -200, margin: -200, categories: [{ category: 'Alquiler', amount: 300, count: 1 }] }),
        ],
      },
      { locationId: 'loc-3', name: 'Sede Maracay', isActive: true, timeZone: 'America/Caracas', currencies: [] },
    ],
    total: {
      locationId: null,
      name: 'Total del grupo',
      isActive: true,
      timeZone: null,
      currencies: [
        usd({
          income: 1600,
          incomeCount: 13,
          expenses: 900,
          expenseCount: 4,
          net: 700,
          margin: 43.8,
          categories: [
            { category: 'Laboratorio', amount: 400, count: 2 },
            { category: 'Alquiler', amount: 300, count: 1 },
            { category: 'Insumos clínicos', amount: 200, count: 1 },
          ],
        }),
      ],
    },
    ...overrides,
  };
}

function mockPhone(matches: boolean) {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
}

describe('ProfitabilityView (DX-410)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    search = new URLSearchParams('tab=rentabilidad');
    jest.mocked(useSedeFormat).mockReturnValue({
      status: 'ready',
      fmt: regionalFormat({ locale: 'es-VE', hourCycle: 'h12' }),
    } as ReturnType<typeof useSedeFormat>);
    jest.mocked(listLocations).mockResolvedValue([
      clinicLocation({ id: 'loc-1', name: 'Sede Chacao' }),
      clinicLocation({ id: 'loc-2', name: 'Sede Valencia' }),
    ]);
    mockedGet.mockResolvedValue(report());
  });

  it('pide «Caja» del mes en curso y escribe la base en la cabecera', async () => {
    render(<ProfitabilityView token="t" />);
    const header = await screen.findByTestId('profitability-header');
    expect(mockedGet).toHaveBeenCalledWith('t', { from: '2026-11-01', to: '2026-11-12', basis: 'CASH' });
    expect(within(header).getByRole('heading', { name: 'Rentabilidad en base Caja' })).toBeInTheDocument();
    expect(header).toHaveTextContent('Resultado = cobrado − gastos pagados, por fecha de pago.');
    expect(screen.getByRole('radio', { name: 'Caja' })).toHaveAttribute('aria-checked', 'true');
  });

  it('una fila por sede y el total del grupo, con resultado y margen por moneda', async () => {
    render(<ProfitabilityView token="t" />);
    const table = await screen.findByRole('table', { name: 'Rentabilidad por sede en USD' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(5);
    expect(flat(rows[0].textContent)).toContain('Cobrado');
    expect(flat(rows[0].textContent)).toContain('Gastos pagados');
    expect(flat(rows[1].textContent)).toContain('Sede Chacao');
    expect(flat(rows[1].textContent)).toMatch(/USD\s?1\.500,00/);
    expect(flat(rows[1].textContent)).toMatch(/USD\s?900,00/);
    expect(flat(rows[1].textContent)).toMatch(/60\s?%/);
    expect(flat(rows[2].textContent)).toContain('Sede Valencia (desactivada)');
    expect(within(rows[2]).getByText(/-200,00|−200,00/)).toHaveClass('text-danger-text');
    expect(flat(rows[3].textContent)).toContain('Sin movimientos');
    expect(flat(rows[4].textContent)).toContain('Total del grupo');
    expect(flat(rows[4].textContent)).toMatch(/USD\s?700,00/);
  });

  it('los gastos por categoría, una columna por sede y el grupo', async () => {
    render(<ProfitabilityView token="t" />);
    const table = await screen.findByRole('table', { name: 'Gastos por categoría en USD' });
    const rows = within(table).getAllByRole('row');
    expect(rows.map((r) => within(r).getAllByRole(r === rows[0] ? 'columnheader' : 'cell')[0].textContent)).toEqual([
      'Categoría',
      'Laboratorio',
      'Alquiler',
      'Insumos clínicos',
      'Total gastos',
    ]);
    expect(flat(rows[2].textContent)).toMatch(/USD\s?300,00/);
  });

  it('cada importe abre los movimientos que lo forman, con los mismos filtros', async () => {
    mockedLines.mockResolvedValue({
      from: '2026-11-01',
      to: '2026-11-12',
      basis: 'CASH',
      side: 'EXPENSE',
      currency: 'USD',
      locationId: 'loc-1',
      category: 'Laboratorio',
      total: 400,
      count: 2,
      page: 1,
      pageSize: 25,
      lines: [
        { id: 'p1', date: '2026-11-05', locationId: 'loc-1', locationName: 'Sede Chacao', amount: 250, concept: 'Laboratorio Dental Ávila', category: 'Laboratorio', method: 'Transferencia', paymentStatus: null },
        { id: 'p2', date: '2026-11-02', locationId: 'loc-1', locationName: 'Sede Chacao', amount: 150, concept: null, category: 'Laboratorio', method: 'Efectivo', paymentStatus: null },
      ],
    });
    render(<ProfitabilityView token="t" />);
    const table = await screen.findByRole('table', { name: 'Gastos por categoría en USD' });
    await userEvent.click(within(table).getByRole('button', { name: /«Laboratorio» de Sede Chacao en USD/ }));
    expect(mockedLines).toHaveBeenCalledWith(
      't',
      { from: '2026-11-01', to: '2026-11-12', basis: 'CASH' },
      { side: 'EXPENSE', currency: 'USD', locationId: 'loc-1', category: 'Laboratorio' },
      1,
      25,
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Gastos pagados: Laboratorio · Sede Chacao · USD')).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getAllByTestId('profitability-line')).toHaveLength(2));
    expect(dialog).toHaveTextContent(/2 movimientos que suman USD\s?400,00/);
    expect(dialog).toHaveTextContent('Laboratorio Dental Ávila');
    expect(dialog).toHaveTextContent('Transferencia');
  });

  it('el total del grupo abre los movimientos de todas las sedes (sin `locationId`)', async () => {
    mockedLines.mockResolvedValue({
      from: '2026-11-01', to: '2026-11-12', basis: 'CASH', side: 'INCOME', currency: 'USD', locationId: null, category: null,
      total: 1600, count: 0, page: 1, pageSize: 25, lines: [],
    });
    render(<ProfitabilityView token="t" />);
    const table = await screen.findByRole('table', { name: 'Rentabilidad por sede en USD' });
    await userEvent.click(within(table).getByRole('button', { name: /cobrado de Total del grupo en USD/ }));
    expect(mockedLines).toHaveBeenCalledWith('t', expect.anything(), { side: 'INCOME', currency: 'USD' }, 1, 25);
  });

  it('«Devengo» en la URL: pide esa base y cambia la cabecera y las columnas', async () => {
    search = new URLSearchParams('tab=rentabilidad&base=devengo&periodo=last_month');
    mockedGet.mockResolvedValue(report({ basis: 'ACCRUAL', definition: ACCRUAL }));
    render(<ProfitabilityView token="t" />);
    expect(await screen.findByRole('heading', { name: 'Rentabilidad en base Devengo' })).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledWith('t', { from: '2026-10-01', to: '2026-10-31', basis: 'ACCRUAL' });
    const table = screen.getByRole('table', { name: 'Rentabilidad por sede en USD' });
    expect(flat(within(table).getAllByRole('row')[0].textContent)).toContain('Producción realizada');
  });

  it('elegir la base reescribe la URL', async () => {
    render(<ProfitabilityView token="t" />);
    await screen.findByTestId('profitability-header');
    await userEvent.click(screen.getByRole('radio', { name: 'Devengo' }));
    expect(replace).toHaveBeenCalledWith('/reportes?tab=rentabilidad&base=devengo', { scroll: false });
  });

  it('«Cómo se calcula» enseña las reglas de la base', async () => {
    render(<ProfitabilityView token="t" />);
    const how = await screen.findByTestId('profitability-how');
    await userEvent.click(within(how).getByRole('button', { name: /Cómo se calcula/ }));
    expect(how).toHaveTextContent('Cada moneda va por separado y sin convertir.');
  });

  it('miembro restringido: avisa de que el total solo suma sus sedes', async () => {
    mockedGet.mockResolvedValue(report({ restrictedToLocations: true }));
    render(<ProfitabilityView token="t" />);
    expect(await screen.findByTestId('profitability-restricted')).toHaveTextContent('el total del grupo suma solo esas');
  });

  it('sin movimientos: el vacío', async () => {
    mockedGet.mockResolvedValue(report({ hasActivity: false, total: { ...report().total, currencies: [] } }));
    render(<ProfitabilityView token="t" />);
    expect(await screen.findByText('Sin ingresos ni gastos')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('error: mensaje y reintento', async () => {
    mockedGet.mockRejectedValueOnce(new Error('caída'));
    render(<ProfitabilityView token="t" />);
    expect(await screen.findByText('No pudimos cargar la rentabilidad.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
    expect(await screen.findByRole('table', { name: 'Rentabilidad por sede en USD' })).toBeInTheDocument();
  });

  it('un rol sin acceso ve el aviso (403)', async () => {
    mockedGet.mockRejectedValue(new ApiError(403, 'Solo la administración ve la rentabilidad de las sedes.'));
    render(<ProfitabilityView token="t" />);
    expect(await screen.findByText('Tu rol no tiene acceso a la rentabilidad de las sedes.')).toBeInTheDocument();
  });

  it('a 390 px cada sede es una tarjeta con su resultado; las categorías siguen en tabla con scroll propio', async () => {
    const restore = mockPhone(true);
    try {
      render(<ProfitabilityView token="t" />);
      const list = await screen.findByRole('list', { name: 'Rentabilidad por sede en USD' });
      const cards = within(list).getAllByRole('listitem');
      expect(cards).toHaveLength(4);
      expect(flat(cards[0].textContent)).toContain('Sede Chacao');
      expect(flat(cards[0].textContent)).toMatch(/Cobrado USD\s?1\.500,00/);
      expect(flat(cards[0].textContent)).toMatch(/Margen 60\s?%/);
      expect(flat(cards[2].textContent)).toContain('Sin movimientos');
      expect(screen.getByRole('table', { name: 'Gastos por categoría en USD' })).toBeInTheDocument();
    } finally {
      restore();
    }
  });

  it('descarga el CSV con los mismos filtros', async () => {
    mockedCsv.mockResolvedValue('csv');
    render(<ProfitabilityView token="t" />);
    await screen.findByRole('table', { name: 'Rentabilidad por sede en USD' });
    await userEvent.click(screen.getByRole('button', { name: 'Descargar CSV' }));
    await waitFor(() =>
      expect(mockedSave).toHaveBeenCalledWith('csv', 'rentabilidad-caja-2026-11-01-2026-11-12.csv', { bom: true }),
    );
    expect(mockedCsv).toHaveBeenCalledWith('t', { from: '2026-11-01', to: '2026-11-12', basis: 'CASH' });
  });
});
