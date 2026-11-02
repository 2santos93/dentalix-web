import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProductionByProcedureView } from './production-by-procedure-view';
import {
  downloadProductionByProcedureCsv,
  getProductionByProcedure,
  getProductionItems,
  type ProductionByProcedure,
} from '@/lib/reports/reports-api';
import { ApiError } from '@/lib/api/client';
import { saveCsv } from '@/lib/files/save-csv';
import { useSedeTimeZone } from '@/lib/locations/use-sede-time-zone';
import { useSedeFormat } from '@/lib/locations/use-sede-format';
import { regionalFormat } from '@/lib/format/regional-format';

jest.mock('../../lib/reports/reports-api', () => ({
  getProductionByProcedure: jest.fn(),
  downloadProductionByProcedureCsv: jest.fn(),
  getProductionItems: jest.fn(),
}));
jest.mock('../../lib/files/save-csv', () => ({ saveCsv: jest.fn() }));
jest.mock('../errors/notify', () => ({ notifyError: jest.fn() }));
jest.mock('../../lib/locations/use-sede-time-zone', () => ({
  ...jest.requireActual('../../lib/locations/use-sede-time-zone'),
  useSedeTimeZone: jest.fn(() => ({
    status: 'ready',
    timeZone: 'America/Bogota',
  })),
  sedeToday: () => '2026-10-24',
}));
jest.mock('../../lib/locations/use-sede-format', () => ({
  ...jest.requireActual('../../lib/locations/use-sede-format'),
  useSedeFormat: jest.fn(),
}));

const mockedZone = useSedeTimeZone as jest.MockedFunction<typeof useSedeTimeZone>;
const mockedFormat = useSedeFormat as jest.MockedFunction<typeof useSedeFormat>;
const mockedGet = getProductionByProcedure as jest.MockedFunction<typeof getProductionByProcedure>;
const mockedCsv = downloadProductionByProcedureCsv as jest.MockedFunction<typeof downloadProductionByProcedureCsv>;
const mockedItems = getProductionItems as jest.MockedFunction<typeof getProductionItems>;

function report(overrides: Partial<ProductionByProcedure> = {}): ProductionByProcedure {
  return {
    from: '2026-10-01',
    to: '2026-10-24',
    scope: 'CLINIC',
    filters: {
      locationId: null,
      locationName: null,
      professionalId: null,
      professionalName: null,
      category: null,
    },
    options: {
      locations: [
        { id: 'l1', name: 'Sede principal', isActive: true },
        { id: 'l2', name: 'Sede Norte', isActive: false },
      ],
      professionals: [{ userId: 'u1', fullName: 'Dra. Uno' }],
      categories: ['Operatoria'],
    },
    rows: [
      {
        catalogItemId: 'c1',
        code: 'RES-1',
        label: 'Resina',
        category: 'Operatoria',
        currency: 'COP',
        count: 3,
        gross: 280,
        discounts: 20,
        net: 260,
        averageNet: 86.67,
        catalogAverage: 100,
        catalogCount: 3,
        differencePercent: -13.3,
      },
      {
        catalogItemId: 'c1',
        code: 'RES-1',
        label: 'Resina',
        category: 'Operatoria',
        currency: 'USD',
        count: 1,
        gross: 50,
        discounts: 0,
        net: 50,
        averageNet: 50,
        catalogAverage: null,
        catalogCount: 0,
        differencePercent: null,
      },
    ],
    categoryTotals: [
      {
        category: 'Operatoria',
        currency: 'COP',
        count: 3,
        gross: 280,
        discounts: 20,
        net: 260,
        averageNet: 86.67,
      },
      {
        category: 'Operatoria',
        currency: 'USD',
        count: 1,
        gross: 50,
        discounts: 0,
        net: 50,
        averageNet: 50,
      },
    ],
    totals: [
      {
        currency: 'COP',
        count: 3,
        gross: 280,
        discounts: 20,
        net: 260,
        averageNet: 86.67,
      },
      {
        currency: 'USD',
        count: 1,
        gross: 50,
        discounts: 0,
        net: 50,
        averageNet: 50,
      },
    ],
    unattributed: [],
    undated: [],
    hasActivity: true,
    ...overrides,
  };
}

const table = () =>
  screen.getByRole('table', {
    name: 'Producción por procedimiento y categoría',
  });

describe('ProductionByProcedureView (DX-423)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedZone.mockReturnValue({ status: 'ready', timeZone: 'America/Bogota' });
    mockedFormat.mockReturnValue({
      status: 'ready',
      fmt: regionalFormat({ locale: 'es-ES', hourCycle: 'h23' }),
    });
    mockedGet.mockResolvedValue(report());
  });

  it('pide el mes en curso y pinta la fila 100/100/80: bruto 280, descuentos 20, neto 260, medio 86,67 y −13,3 % frente a catálogo', async () => {
    render(<ProductionByProcedureView token="t" />);
    await screen.findByRole('table');
    expect(mockedGet).toHaveBeenCalledWith('t', {
      from: '2026-10-01',
      to: '2026-10-24',
    });
    const [cop] = screen.getAllByTestId('production-row');
    for (const text of ['COP', '3', /280,00/, /20,00/, /260,00/, /86,67/, /100,00/, '-13,3 %']) {
      expect(within(cop).getByText(text)).toBeInTheDocument();
    }
    expect(within(table()).getByRole('columnheader', { name: /Honorario medio/ })).toBeInTheDocument();
  });

  it('subtotal y total por moneda: nunca una línea que mezcle COP y USD', async () => {
    render(<ProductionByProcedureView token="t" />);
    await screen.findByRole('table');
    expect(
      screen.getAllByTestId('production-subtotal').map((r) => within(r).getAllByRole('cell')[0].textContent),
    ).toEqual(['COP', 'USD']);
    expect(screen.getAllByTestId('production-total').map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual(
      ['COP', 'USD'],
    );
    expect(within(table()).getByRole('columnheader', { name: 'Operatoria' })).toBeInTheDocument();
  });

  it('«Sin atribuir»: su línea y el aviso que lo explica', async () => {
    mockedGet.mockResolvedValue(
      report({
        unattributed: [{ currency: 'COP', count: 2, gross: 95, discounts: 0, net: 95 }],
      }),
    );
    render(<ProductionByProcedureView token="t" />);
    await screen.findByRole('table');
    expect(screen.getByRole('note')).toHaveTextContent('«Sin atribuir»: procedimientos realizados en el período sin sede');
    expect(
      within(screen.getByTestId('production-unattributed')).getByText(/95,00/, {
        selector: 'td.font-medium',
      }),
    ).toBeInTheDocument();
  });

  it('filtros: sede, profesional y categoría van a la API', async () => {
    render(<ProductionByProcedureView token="t" />);
    await screen.findByRole('table');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Sede de realización' }), 'l2');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Profesional' }), 'u1');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Categoría' }), 'Operatoria');
    await waitFor(() =>
      expect(mockedGet).toHaveBeenLastCalledWith('t', {
        from: '2026-10-01',
        to: '2026-10-24',
        locationId: 'l2',
        professionalId: 'u1',
        category: 'Operatoria',
      }),
    );
    expect(screen.getByRole('option', { name: 'Sede Norte (desactivada)' })).toBeInTheDocument();
  });

  it('un odontólogo (scope OWN) no tiene filtro de profesional y ve «Solo tu producción»', async () => {
    mockedGet.mockResolvedValue(report({ scope: 'OWN' }));
    render(<ProductionByProcedureView token="t" />);
    await screen.findByRole('table');
    expect(screen.queryByRole('combobox', { name: 'Profesional' })).not.toBeInTheDocument();
    expect(screen.getByText(/Solo tu producción/)).toBeInTheDocument();
  });

  it('clic en una fila: abre sus procedimientos con el paciente', async () => {
    mockedItems.mockResolvedValue({
      items: [
        {
          id: 'i1',
          completedAt: '2026-10-07T15:00:00.000Z',
          patientId: 'p1',
          patientName: 'Paciente Gama',
          professionalId: 'u2',
          professionalName: 'Dr. Dos',
          locationId: 'l1',
          locationName: 'Sede principal',
          toothNumber: '16',
          currency: 'COP',
          price: 80,
          discount: 20,
          net: 60,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 25,
    } as unknown as Awaited<ReturnType<typeof getProductionItems>>);
    render(<ProductionByProcedureView token="t" />);
    await screen.findByRole('table');
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Ver los procedimientos de RES-1 Resina en COP',
      }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('RES-1 · Resina')).toBeInTheDocument();
    expect(await within(dialog).findByRole('link', { name: 'Paciente Gama' })).toHaveAttribute('href', '/patients/p1');
    expect(within(dialog).getByText('Dr. Dos')).toBeInTheDocument();
    expect(mockedItems).toHaveBeenCalledWith(
      't',
      expect.objectContaining({
        catalogItemId: 'c1',
        currency: 'COP',
        page: 1,
      }),
    );
  });

  it('detalle: paciente eliminado sin nombre ni enlace, y cada fecha con la zona de SU sede', async () => {
    mockedItems.mockResolvedValue({
      items: [
        {
          id: 'i2',
          // 03:00 UTC del 01/10: en la sede aún es el 30/09; en Tokio, el 01/10.
          completedAt: '2026-10-01T03:00:00.000Z',
          patientId: null,
          patientName: null,
          professionalId: 'u2',
          professionalName: 'Dr. Dos',
          locationId: 'l9',
          locationName: 'Sede Tokio',
          timeZone: 'Asia/Tokyo',
          toothNumber: '16',
          currency: 'COP',
          price: 80,
          discount: 0,
          net: 80,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 25,
    } as unknown as Awaited<ReturnType<typeof getProductionItems>>);
    render(<ProductionByProcedureView token="t" />);
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Ver los procedimientos de RES-1 Resina en COP' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Paciente eliminado')).toBeInTheDocument();
    expect(within(dialog).queryByRole('link')).not.toBeInTheDocument();
    expect(within(dialog).getByText('01/10/2026')).toBeInTheDocument();
  });

  it('exporta el CSV con los mismos filtros', async () => {
    mockedCsv.mockResolvedValue('csv');
    render(<ProductionByProcedureView token="t" />);
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    await waitFor(() =>
      expect(saveCsv).toHaveBeenCalledWith('csv', 'produccion-por-procedimiento-2026-10-01-2026-10-24.csv', {
        bom: true,
      }),
    );
    expect(mockedCsv).toHaveBeenCalledWith('t', {
      from: '2026-10-01',
      to: '2026-10-24',
    });
    expect(screen.getByText('Reporte exportado.')).toBeInTheDocument();
  });

  it('sin fecha: aviso bajo la tabla con los importes, no una fila', async () => {
    mockedGet.mockResolvedValue(
      report({ undated: [{ currency: 'COP', count: 2, gross: 95, discounts: 0, net: 95 }] }),
    );
    render(<ProductionByProcedureView token="t" />);
    await screen.findByRole('table');
    const note = screen.getByTestId('production-undated');
    expect(note).toHaveAttribute('role', 'note');
    expect(note).toHaveTextContent('2 procedimientos realizados sin fecha');
    expect(note).toHaveTextContent(/95,00\s*COP|COP\s*95,00/);
    expect(screen.queryByTestId('production-unattributed')).not.toBeInTheDocument();
  });

  it('vacío con «sin fecha»: estado vacío y el aviso debajo', async () => {
    mockedGet.mockResolvedValue(
      report({
        rows: [],
        categoryTotals: [],
        totals: [],
        hasActivity: false,
        undated: [{ currency: 'COP', count: 1, gross: 90000, discounts: 0, net: 90000 }],
      }),
    );
    render(<ProductionByProcedureView token="t" />);
    expect(await screen.findByText('No hay procedimientos realizados en este período')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByTestId('production-undated')).toHaveTextContent('1 procedimiento realizado sin fecha');
  });

  it('390 px: la fila de categoría es una celda fija (como la primera columna) y el resto, vacío del mismo fondo', async () => {
    render(<ProductionByProcedureView token="t" />);
    await screen.findByRole('table');
    const header = within(table()).getByRole('columnheader', { name: 'Operatoria' });
    expect(header).toHaveClass('sticky', 'left-0');
    expect(header).not.toHaveAttribute('colspan');
    const filler = header.nextElementSibling as HTMLElement;
    expect(filler.tagName).toBe('TD');
    expect(filler).toHaveAttribute('colspan', '8');
    expect(filler).toHaveAttribute('aria-hidden', 'true');
  });

  it('vacío: el estado que enseña a cambiar el período', async () => {
    mockedGet.mockResolvedValue(report({ rows: [], categoryTotals: [], totals: [], hasActivity: false }));
    render(<ProductionByProcedureView token="t" />);
    expect(await screen.findByText('No hay procedimientos realizados en este período')).toBeInTheDocument();
  });

  it('error: mensaje y Reintentar vuelve a pedir', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError(500, 'boom'));
    render(<ProductionByProcedureView token="t" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    await screen.findByRole('table');
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('403 sin filtros: aviso de rol, sin tabla', async () => {
    mockedGet.mockRejectedValue(new ApiError(403, 'Solo la administración'));
    render(<ProductionByProcedureView token="t" />);
    expect(await screen.findByText('Tu rol no tiene acceso a la producción.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('cargando: esqueleto con nombre', () => {
    mockedGet.mockReturnValue(new Promise(() => undefined));
    render(<ProductionByProcedureView token="t" />);
    expect(screen.getByRole('status', { name: 'Cargando la producción' })).toBeInTheDocument();
  });

  it('personalizado de más de 24 meses: error junto a las fechas, sin pedir a la API', async () => {
    render(<ProductionByProcedureView token="t" />);
    await screen.findByRole('table');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Período' }), 'custom');
    // «Desde» es un DatePicker segmentado: se escribe el año (2020) en su segmento.
    const [fromGroup] = screen.getAllByRole('group', { name: 'Desde' });
    const year = within(fromGroup).getAllByRole('spinbutton').find((el) => el.getAttribute('data-type') === 'year')!;
    mockedGet.mockClear();
    await userEvent.click(year);
    await userEvent.keyboard('2020');
    expect(await screen.findByText(/caben como mucho 24 meses/)).toBeInTheDocument();
    expect(mockedGet).not.toHaveBeenCalledWith('t', expect.objectContaining({ from: expect.stringMatching(/^2020-/) }));
  });
});
