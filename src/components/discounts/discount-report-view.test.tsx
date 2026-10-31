import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DiscountReportView } from './discount-report-view';
import {
  downloadDiscountReportCsv,
  getDiscountReport,
  type DiscountReport,
  type DiscountReportItem,
} from '@/lib/discounts/discounts-api';
import { getTokenRole } from '@/lib/auth/token-role';
import { ApiError } from '@/lib/api/client';
import { SEDE_TIME_ZONE_ERROR, useSedeTimeZone } from '@/lib/locations/use-sede-time-zone';
import { SEDE_LOCALE_ERROR, useSedeFormat } from '@/lib/locations/use-sede-format';
import { regionalFormat } from '@/lib/format/regional-format';

jest.mock('../../lib/discounts/discounts-api', () => ({
  getDiscountReport: jest.fn(),
  downloadDiscountReportCsv: jest.fn(),
}));
jest.mock('../../lib/auth/token-role', () => ({ getTokenRole: jest.fn() }));
jest.mock('../errors/notify', () => ({ notifyError: jest.fn() }));
jest.mock('../../lib/locations/use-sede-time-zone', () => ({
  ...jest.requireActual('../../lib/locations/use-sede-time-zone'),
  useSedeTimeZone: jest.fn(() => ({ status: 'ready', timeZone: 'America/Bogota' })),
  sedeToday: () => '2026-10-17',
}));
jest.mock('../../lib/appointments/staff-api', () => ({
  listStaff: jest.fn().mockResolvedValue([
    { userId: 'dr-1', fullName: 'Dra. Ríos', role: 'DENTIST' },
    { userId: 'adm-1', fullName: 'Dr. Owner', role: 'ADMIN' },
  ]),
}));

// DX-378 (FE-078): el formato de la sede. es-ES pinta igual que «es»: las cifras de estas pruebas no cambian.
jest.mock('../../lib/locations/use-sede-format', () => ({
  ...jest.requireActual('../../lib/locations/use-sede-format'),
  useSedeFormat: jest.fn(),
}));

const mockedZone = useSedeTimeZone as jest.MockedFunction<typeof useSedeTimeZone>;
const mockedFormat = useSedeFormat as jest.MockedFunction<typeof useSedeFormat>;
const mockedReport = getDiscountReport as jest.MockedFunction<typeof getDiscountReport>;
const mockedCsv = downloadDiscountReportCsv as jest.MockedFunction<typeof downloadDiscountReportCsv>;
const mockedRole = getTokenRole as jest.MockedFunction<typeof getTokenRole>;

function row(overrides: Partial<DiscountReportItem> = {}): DiscountReportItem {
  return {
    itemId: 'item-1',
    planId: 'plan-1',
    planStatus: 'PRESENTED',
    planOptionLabel: null,
    planCreatedAt: '2026-10-01T15:00:00.000Z',
    planCreatedOn: '2026-10-01',
    patientId: 'pat-1',
    patientName: 'Ana Pérez',
    toothNumber: '36',
    procedure: 'Corona libre de metal',
    currency: 'COP',
    catalogPrice: null,
    price: 1200000,
    priceReduction: 0,
    itemDiscount: 180000,
    discount: 180000,
    percent: 15,
    reason: 'PROMOTION',
    reasonNote: 'Campaña de octubre',
    discountById: 'adm-1',
    discountByName: 'Dr. Owner',
    discountAt: '2026-10-10T15:00:00.000Z',
    discountOn: '2026-10-10',
    locationId: 'loc-1',
    locationName: 'Sede principal',
    priceSource: 'CATALOG',
    agreementName: null,
    basePrice: null,
    agreementReduction: 0,
    agreementPercent: 0,
    agreementAssignedById: null,
    agreementAssignedByName: null,
    createdById: 'adm-1',
    createdByName: 'Dr. Owner',
    ...overrides,
  };
}

function report(items: DiscountReportItem[], overrides: Partial<DiscountReport> = {}): DiscountReport {
  return {
    from: '2026-10-01',
    to: '2026-10-17',
    scope: { location: { id: 'loc-1', name: 'Sede principal' } },
    totals: items.length
      ? [
          {
            currency: 'COP',
            items: items.length,
            gross: 1200000,
            discount: 180000,
            percentOfGross: 15,
          },
        ]
      : [],
    agreementTotals: [],
    items,
    total: items.length,
    page: 1,
    pageSize: 50,
    ...overrides,
  };
}

/** La primera fila de datos de la tabla (DataList en escritorio). */
async function findRow(): Promise<HTMLElement> {
  const table = await screen.findByRole('table', { name: 'Descuentos del periodo' });
  return within(table).getAllByRole('row')[1];
}

function mockPhone(): () => void {
  const original = window.matchMedia;
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
  return () => {
    window.matchMedia = original;
  };
}

describe('DiscountReportView (DX-204)', () => {
  beforeEach(() => {
    mockedReport.mockReset();
    mockedZone.mockReturnValue({ status: 'ready', timeZone: 'America/Bogota' });
    mockedFormat.mockReturnValue({ status: 'ready', fmt: regionalFormat({ locale: 'es-ES', hourCycle: 'h23' }) });
    mockedCsv.mockReset();
    mockedRole.mockReturnValue('ADMIN');
  });

  it('DX-378 (FE-078): importes, % y fechas con el formato de la sede (en-US), no con «es»', async () => {
    mockedFormat.mockReturnValue({ status: 'ready', fmt: regionalFormat({ locale: 'en-US', hourCycle: 'h12' }) });
    mockedReport.mockResolvedValue(report([row()]));
    render(<DiscountReportView token="tok" />);
    const summary = await screen.findByTestId('discount-total-COP');
    expect(within(summary).getByText('15%')).toBeInTheDocument();
    expect(within(summary).getByText(/^COP\s180,000\.00$/)).toBeInTheDocument();
    expect(within(await findRow()).getByText(/^\d{2}\/\d{2}\/\d{4}$/)).toBeInTheDocument();
  });

  it('DX-378: sin formato de la sede, su error con Reintentar en lugar del informe', async () => {
    mockedFormat.mockReturnValue({ status: 'error', message: SEDE_LOCALE_ERROR, retry: jest.fn(), locationId: null });
    mockedReport.mockResolvedValue(report([row()]));
    render(<DiscountReportView token="tok" />);
    expect(await screen.findByText(SEDE_LOCALE_ERROR)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('pide el mes en curso hasta hoy y muestra total, % sobre el bruto y el detalle', async () => {
    mockedReport.mockResolvedValue(report([row()]));
    render(<DiscountReportView token="tok" />);
    await waitFor(() =>
      expect(mockedReport).toHaveBeenCalledWith('tok', {
        from: '2026-10-01',
        to: '2026-10-17',
        page: 1,
      }),
    );
    const summary = await screen.findByTestId('discount-total-COP');
    expect(within(summary).getByText('15 %')).toBeInTheDocument();
    expect(within(summary).getByText(/180\.000,00/)).toBeInTheDocument();
    expect(screen.getByTestId('scope-marker')).toHaveTextContent('Sede principal');
    // La moneda y los ítems encabezan la fila del resumen; no son una métrica más.
    expect(within(summary).getByText('COP · 1 ítem')).toBeInTheDocument();
    const tableRow = await findRow();
    expect(within(tableRow).getByRole('link', { name: 'Ana Pérez' })).toHaveAttribute(
      'href',
      '/patients/pat-1?tab=treatment-plans',
    );
    expect(within(tableRow).getByText('Ana Pérez')).toBeInTheDocument();
    expect(within(tableRow).getByText('Promoción o campaña')).toBeInTheDocument();
    expect(within(tableRow).getByText('Campaña de octubre')).toBeInTheDocument();
    expect(within(tableRow).getByText('Dr. Owner')).toBeInTheDocument();
  });

  it('una rebaja de precio frente al catálogo sale con su importe y el % sobre el de catálogo (SEC-041)', async () => {
    mockedReport.mockResolvedValue(
      report([
        row({
          catalogPrice: 1000000,
          price: 800000,
          priceReduction: 200000,
          itemDiscount: 0,
          discount: 200000,
          percent: 20,
        }),
      ]),
    );
    render(<DiscountReportView token="tok" />);
    const tableRow = await findRow();
    expect(within(tableRow).getByText(/−200\.000,00/)).toBeInTheDocument();
    expect(within(tableRow).getByText(/20 % de 1\.000\.000,00/)).toBeInTheDocument();
    expect(within(tableRow).getByText(/Precio rebajado a 800\.000,00/)).toBeInTheDocument();
  });

  it('SEC-047: la rebaja de convenio sale aparte, con quién asignó el convenio y quién creó el ítem', async () => {
    const agreed = row({
      priceSource: 'AGREEMENT_PERCENT',
      agreementName: 'Cortesía socios',
      basePrice: 2000000,
      catalogPrice: 0,
      price: 0,
      itemDiscount: 0,
      discount: 0,
      percent: 0,
      reason: null,
      reasonNote: null,
      discountById: null,
      discountByName: null,
      agreementReduction: 2000000,
      agreementPercent: 100,
      agreementAssignedById: 'adm-1',
      agreementAssignedByName: 'Dr. Owner',
      createdById: 'dr-1',
      createdByName: 'Dra. Ríos',
    });
    mockedReport.mockResolvedValue(
      report([agreed], {
        totals: [],
        agreementTotals: [{ currency: 'COP', items: 1, reduction: 2000000 }],
      }),
    );
    render(<DiscountReportView token="tok" />);
    // M1: las rebajas de convenio tienen su propio total, aparte de DX-204.
    const summary = await screen.findByTestId('agreement-total-COP');
    expect(within(summary).getByText('COP · 1 ítem con rebaja de convenio')).toBeInTheDocument();
    expect(within(summary).getByText(/2\.000\.000,00/)).toBeInTheDocument();
    expect(screen.queryByTestId('discount-total-COP')).not.toBeInTheDocument();
    const tableRow = await findRow();
    expect(within(tableRow).getByText(/Convenio «Cortesía socios»/)).toHaveTextContent(/−\s?2\.000\.000,00.*100 %/);
    expect(within(tableRow).getByText('Convenio asignado por Dr. Owner')).toBeInTheDocument();
    expect(within(tableRow).getByText('Ítem creado por Dra. Ríos')).toBeInTheDocument();
    // B5: motivo «Convenio …» y el autor real, no «Sin registrar».
    expect(within(tableRow).getByText('Convenio Cortesía socios')).toBeInTheDocument();
    expect(within(tableRow).queryByText('Sin motivo')).not.toBeInTheDocument();
    expect(within(tableRow).queryByText('Sin registrar')).not.toBeInTheDocument();
    expect(within(tableRow).getByTestId('discount-author')).toHaveTextContent('Dr. Owner');
    // Sin descuento propio: no se pinta un «−0» como si lo hubiera.
    expect(within(tableRow).queryByText(/^−\s?0,00/)).not.toBeInTheDocument();
  });

  it('B5: sin quien asignó el convenio, el autor es quien creó el ítem', async () => {
    mockedReport.mockResolvedValue(
      report(
        [
          row({
            agreementName: 'Surco',
            basePrice: 100000,
            itemDiscount: 0,
            discount: 0,
            reason: null,
            reasonNote: null,
            discountByName: null,
            agreementReduction: 10000,
            agreementPercent: 10,
            agreementAssignedByName: null,
            createdByName: 'Dra. Ríos',
          }),
        ],
        { totals: [], agreementTotals: [{ currency: 'COP', items: 1, reduction: 10000 }] },
      ),
    );
    render(<DiscountReportView token="tok" />);
    const tableRow = await findRow();
    expect(within(tableRow).getByTestId('discount-author')).toHaveTextContent('Dra. Ríos');
  });

  it('«Sin motivo» se marca como aviso (warning), no se apaga en muted', async () => {
    mockedReport.mockResolvedValue(report([row({ reason: null, reasonNote: null })]));
    render(<DiscountReportView token="tok" />);
    const badge = within(await findRow()).getByText('Sin motivo');
    expect(badge).toHaveClass('bg-warning-subtle');
  });

  describe('teléfono (<640px)', () => {
    let restore: () => void;
    beforeEach(() => {
      restore = mockPhone();
    });
    afterEach(() => restore());

    it('cada descuento es una tarjeta compacta que abre los planes del paciente', async () => {
      mockedReport.mockResolvedValue(report([row(), row({ itemId: 'item-2', reason: null, reasonNote: null })]));
      render(<DiscountReportView token="tok" />);
      const list = await screen.findByRole('list', { name: 'Descuentos del periodo' });
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      const cards = within(list).getAllByRole('listitem');
      expect(cards).toHaveLength(2);
      expect(within(cards[0]).getByRole('link')).toHaveAttribute('href', '/patients/pat-1?tab=treatment-plans');
      expect(within(list).getByText('Sin motivo')).toBeInTheDocument();
    });

    it('SEC-047 / QA D1: la frase del convenio va en la línea 2 (que parte), no junto al importe', async () => {
      mockedReport.mockResolvedValue(
        report(
          [
            row({
              agreementName: 'Cortesía socios',
              basePrice: 2000000,
              price: 0,
              itemDiscount: 0,
              discount: 0,
              percent: 0,
              reason: null,
              reasonNote: null,
              discountByName: null,
              agreementReduction: 2000000,
              agreementPercent: 100,
              agreementAssignedByName: 'Dr. Owner',
            }),
          ],
          { totals: [], agreementTotals: [{ currency: 'COP', items: 1, reduction: 2000000 }] },
        ),
      );
      render(<DiscountReportView token="tok" />);
      const card = within(await screen.findByRole('list', { name: 'Descuentos del periodo' })).getByRole('listitem');
      expect(card).toHaveTextContent(/Convenio «Cortesía socios»/);
      expect(card).toHaveTextContent('Dado por: Dr. Owner');
      expect(card).not.toHaveTextContent('Sin registrar');
      const amount = within(card).getByTestId('discount-card-amount');
      expect(amount).not.toHaveTextContent(/Convenio «/);
      expect(amount).toHaveTextContent(/−\s?2\.000\.000,00/);
    });
  });

  it('estado de carga, luego vacío', async () => {
    let resolve: (value: DiscountReport) => void = () => {};
    mockedReport.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<DiscountReportView token="tok" />);
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
    resolve(report([]));
    expect(await screen.findByText('No hubo descuentos en este periodo')).toBeInTheDocument();
  });

  it('error con reintento', async () => {
    mockedReport.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(report([row()]));
    render(<DiscountReportView token="tok" />);
    expect(await screen.findByText('No pudimos cargar el informe de descuentos.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(await findRow()).toBeInTheDocument();
  });

  it('un rol sin acceso ve el aviso, sin filtros ni exportar', async () => {
    mockedRole.mockReturnValue('DENTIST');
    mockedReport.mockRejectedValue(new ApiError(403, 'Solo la administración ve el informe de descuentos.'));
    render(<DiscountReportView token="tok" />);
    expect(await screen.findByText('Tu rol no tiene acceso al informe de descuentos.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Exportar CSV' })).not.toBeInTheDocument();
  });

  it('filtra por quién lo dio y exporta con los mismos filtros', async () => {
    mockedReport.mockResolvedValue(report([row()]));
    mockedCsv.mockResolvedValue('﻿Fecha\r\n');
    const createObjectURL = jest.fn(() => 'blob:x');
    Object.assign(URL, { createObjectURL, revokeObjectURL: jest.fn() });
    render(<DiscountReportView token="tok" />);
    await findRow();
    await userEvent.selectOptions(await screen.findByLabelText('Quién lo dio'), 'dr-1');
    await waitFor(() =>
      expect(mockedReport).toHaveBeenLastCalledWith('tok', {
        from: '2026-10-01',
        to: '2026-10-17',
        professionalId: 'dr-1',
        page: 1,
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    await waitFor(() =>
      expect(mockedCsv).toHaveBeenCalledWith('tok', {
        from: '2026-10-01',
        to: '2026-10-17',
        professionalId: 'dr-1',
      }),
    );
    expect(await screen.findByText('Informe exportado.')).toBeInTheDocument();
  });

  it('consumers render SedeConfigError without a zone', async () => {
    const retry = jest.fn();
    mockedZone.mockReturnValue({ status: 'error', message: SEDE_TIME_ZONE_ERROR, retry });
    render(<DiscountReportView token="tok" />);
    expect(
      await screen.findByText('No se pudo saber la zona horaria de la sede. Vuelve a intentarlo.'),
    ).toBeInTheDocument();
    // Sin zona no hay período por defecto: no se consulta con otra zona.
    expect(mockedReport).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
