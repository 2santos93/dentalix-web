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
  useSedeTimeZone: jest.fn(() => ({ status: 'ready', timeZone: 'America/Caracas' })),
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
    currency: 'USD',
    catalogPrice: null,
    catalogCurrency: null,
    referenceCurrency: null,
    referencePriceInPlan: null,
    basePriceInPlan: null,
    rate: null,
    baseRate: null,
    agreementUnmeasured: false,
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
            currency: 'USD',
            items: items.length,
            gross: 1200000,
            discount: 180000,
            percentOfGross: 15,
          },
        ]
      : [],
    agreementTotals: [],
    agreementUnmeasuredTotals: [],
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
    mockedZone.mockReturnValue({ status: 'ready', timeZone: 'America/Caracas' });
    mockedFormat.mockReturnValue({ status: 'ready', fmt: regionalFormat({ locale: 'es-ES', hourCycle: 'h23' }) });
    mockedCsv.mockReset();
    mockedRole.mockReturnValue('ADMIN');
  });

  it('DX-378 (FE-078): importes, % y fechas con el formato de la sede (en-US), no con «es»', async () => {
    mockedFormat.mockReturnValue({ status: 'ready', fmt: regionalFormat({ locale: 'en-US', hourCycle: 'h12' }) });
    mockedReport.mockResolvedValue(report([row()]));
    render(<DiscountReportView token="tok" />);
    const summary = await screen.findByTestId('discount-total-USD');
    expect(within(summary).getByText('15%')).toBeInTheDocument();
    expect(within(summary).getByText(/^USD\s180,000\.00$/)).toBeInTheDocument();
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
    const summary = await screen.findByTestId('discount-total-USD');
    expect(within(summary).getByText('15 %')).toBeInTheDocument();
    expect(within(summary).getByText(/180\.000,00/)).toBeInTheDocument();
    expect(screen.getByTestId('scope-marker')).toHaveTextContent('Sede principal');
    // La moneda y los ítems encabezan la fila del resumen; no son una métrica más.
    expect(within(summary).getByText('USD · 1 ítem')).toBeInTheDocument();
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

  it('DX-513-bis: una rebaja frente al catálogo en otra moneda dice la cifra del catálogo en su moneda y la tasa congelada', async () => {
    mockedReport.mockResolvedValue(
      report([
        row({
          currency: 'VES',
          catalogPrice: 4.5,
          referenceCurrency: 'USD',
          referencePriceInPlan: 3960,
          rate: { fromPerBase: 1, toPerBase: 880, source: 'MANUAL', rateDate: '2026-10-10' },
          price: 3900,
          priceReduction: 60,
          itemDiscount: 0,
          discount: 60,
          percent: 1.52,
        }),
      ]),
    );
    render(<DiscountReportView token="tok" />);
    const tableRow = await findRow();
    expect(within(tableRow).getByText(/Precio rebajado a 3\.?900,00 VES/)).toBeInTheDocument();
    expect(within(tableRow).getByText(/^Catálogo 4,50 USD · tasa 1 USD = 880 VES del 10\/10\/2026, manual$/)).toBeInTheDocument();
  });

  it('DX-513-bis: sin tasa (misma moneda), no hay línea de catálogo convertido', async () => {
    mockedReport.mockResolvedValue(
      report([row({ catalogPrice: 1000000, referenceCurrency: 'USD', referencePriceInPlan: 1000000, price: 800000, priceReduction: 200000, discount: 200000, itemDiscount: 0, percent: 20 })]),
    );
    render(<DiscountReportView token="tok" />);
    const tableRow = await findRow();
    expect(within(tableRow).queryByText(/^Catálogo /)).not.toBeInTheDocument();
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
        agreementTotals: [{ currency: 'USD', items: 1, reduction: 2000000 }],
      }),
    );
    render(<DiscountReportView token="tok" />);
    // M1: las rebajas de convenio tienen su propio total, aparte de DX-204.
    const summary = await screen.findByTestId('agreement-total-USD');
    expect(within(summary).getByText('USD · 1 ítem con rebaja de convenio')).toBeInTheDocument();
    expect(within(summary).getByText(/2\.000\.000,00/)).toBeInTheDocument();
    expect(screen.queryByTestId('discount-total-USD')).not.toBeInTheDocument();
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

  // M1 (DX-513-bis): convenio por % con el catálogo en otra moneda. La
  // rebaja y su % se miden sobre la base CONVERTIDA (`basePriceInPlan`); la
  // base cruda está en VES y nunca se pinta con la moneda del plan.
  describe('M1: convenio por % entre monedas', () => {
    const crossAgreement = (overrides: Partial<DiscountReportItem> = {}) =>
      row({
        currency: 'USD',
        priceSource: 'AGREEMENT_PERCENT',
        agreementName: 'Seguros Caracas',
        catalogCurrency: 'VES',
        referenceCurrency: 'VES',
        catalogPrice: 3240,
        basePrice: 3600,
        referencePriceInPlan: 3.68,
        basePriceInPlan: 4.09,
        rate: { fromPerBase: 880, toPerBase: 1, source: 'MANUAL', rateDate: '2026-10-10' },
        price: 3.68,
        priceReduction: 0,
        itemDiscount: 0,
        discount: 0,
        percent: 0,
        reason: null,
        reasonNote: null,
        agreementReduction: 0.41,
        agreementPercent: 10.02,
        ...overrides,
      });

    it('la base del % es la convertida, en la moneda del plan', async () => {
      mockedReport.mockResolvedValue(
        report([crossAgreement()], {
          totals: [],
          agreementTotals: [{ currency: 'USD', items: 1, reduction: 0.41 }],
        }),
      );
      render(<DiscountReportView token="tok" />);
      const tableRow = await findRow();
      const line = within(tableRow).getByText(/Convenio «Seguros Caracas»/);
      expect(line).toHaveTextContent(/de 4,09\sUSD\)$/);
      expect(line).not.toHaveTextContent(/3\.?600/);
    });

    it('sin base convertida, la base va con SU moneda (VES), nunca con la del plan', async () => {
      mockedReport.mockResolvedValue(
        report([crossAgreement({ basePriceInPlan: null })], {
          totals: [],
          agreementTotals: [{ currency: 'USD', items: 1, reduction: 0.41 }],
        }),
      );
      render(<DiscountReportView token="tok" />);
      const tableRow = await findRow();
      const line = within(tableRow).getByText(/Convenio «Seguros Caracas»/);
      expect(line).toHaveTextContent(/de 3\.?600,00\sVES\)$/);
      expect(line).not.toHaveTextContent(/3\.?600,00\sUSD/);
    });
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
        { totals: [], agreementTotals: [{ currency: 'USD', items: 1, reduction: 10000 }] },
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
          { totals: [], agreementTotals: [{ currency: 'USD', items: 1, reduction: 2000000 }] },
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

  // DX-513-ter (test 15): lista de convenio en USD (3,50) con el catálogo en
  // VES (3.600 Bs.). Medida: la rebaja sobre la base convertida y una línea
  // con el catálogo en su moneda y la tasa congelada. Sin medir: una línea
  // neutra «sin referencia comparable» y «Sin medir» en el importe.
  describe('DX-513-ter: lista de convenio entre monedas', () => {
    const RATE_880 = { fromPerBase: 880, toPerBase: 1, source: 'MANUAL' as const, rateDate: '2026-11-07' };
    const listAgreement = (overrides: Partial<DiscountReportItem> = {}) =>
      row({
        currency: 'USD',
        priceSource: 'AGREEMENT_PRICE_LIST',
        agreementName: 'Empresa',
        catalogCurrency: 'VES',
        referenceCurrency: 'USD',
        catalogPrice: 3.5,
        referencePriceInPlan: 3.5,
        basePrice: 3600,
        price: 3.5,
        priceReduction: 0,
        itemDiscount: 0,
        discount: 0,
        percent: 0,
        reason: null,
        reasonNote: null,
        discountById: null,
        discountByName: null,
        agreementAssignedById: 'adm-1',
        agreementAssignedByName: 'Dr. Owner',
        ...overrides,
      });
    const measured = () =>
      listAgreement({ basePriceInPlan: 4.09, baseRate: RATE_880, agreementReduction: 0.59, agreementPercent: 14.43 });
    const unmeasured = () => listAgreement({ itemId: 'item-2', agreementUnmeasured: true });

    it('medida: la rebaja sobre la base convertida y el catálogo en VES con su tasa; nunca «1 USD = 880 USD»', async () => {
      mockedReport.mockResolvedValue(
        report([measured()], { totals: [], agreementTotals: [{ currency: 'USD', items: 1, reduction: 0.59 }] }),
      );
      render(<DiscountReportView token="tok" />);
      const tableRow = await findRow();
      expect(within(tableRow).getByText(/Convenio «Empresa»/)).toHaveTextContent(
        /^Convenio «Empresa»: −0,59\sUSD \(14,43\s%\sde 4,09\sUSD\)$/,
      );
      expect(
        within(tableRow).getByText(/^Catálogo 3\.?600,00 VES · tasa 1 USD = 880 VES del 07\/11\/2026, manual$/),
      ).toBeInTheDocument();
      expect(document.body).not.toHaveTextContent(/1 USD = 880 USD/);
      expect(within(tableRow).queryByText('Sin medir')).not.toBeInTheDocument();
    });

    it('sin medir: línea neutra «sin referencia comparable», «Sin medir» en el importe (no «−0») y el autor del convenio', async () => {
      mockedReport.mockResolvedValue(
        report([unmeasured()], { totals: [], agreementUnmeasuredTotals: [{ currency: 'USD', items: 1 }] }),
      );
      render(<DiscountReportView token="tok" />);
      const tableRow = await findRow();
      const line = within(tableRow).getByText(/sin referencia comparable/);
      expect(line).toHaveTextContent('Convenio «Empresa»: sin referencia comparable (catálogo en VES, plan en USD)');
      expect(line).toHaveClass('text-muted');
      expect(within(tableRow).getByText('Sin medir')).toBeInTheDocument();
      expect(within(tableRow).queryByText(/^−\s?0,00/)).not.toBeInTheDocument();
      expect(within(tableRow).queryByText(/^Catálogo /)).not.toBeInTheDocument();
      // Es un convenio, no un descuento sin motivo: ni aviso ni «Sin registrar».
      expect(within(tableRow).getByText('Convenio Empresa')).toBeInTheDocument();
      expect(within(tableRow).queryByText('Sin motivo')).not.toBeInTheDocument();
      expect(within(tableRow).getByTestId('discount-author')).toHaveTextContent('Dr. Owner');
    });

    it('sin medir y con descuento propio: el descuento sale y la línea neutra también', async () => {
      mockedReport.mockResolvedValue(
        report([unmeasured()].map((r) => ({ ...r, itemDiscount: 0.5, discount: 0.5, percent: 14.29, reason: 'PROMOTION' }))),
      );
      render(<DiscountReportView token="tok" />);
      const tableRow = await findRow();
      expect(within(tableRow).getByText(/^−\s?0,50\sUSD$/)).toBeInTheDocument();
      expect(within(tableRow).getByText(/sin referencia comparable/)).toBeInTheDocument();
      expect(within(tableRow).queryByText('Sin medir')).not.toBeInTheDocument();
    });

    it('el resumen cuenta las filas sin medir por moneda, sin cifra', async () => {
      mockedReport.mockResolvedValue(
        report([measured(), unmeasured()], {
          totals: [],
          agreementTotals: [{ currency: 'USD', items: 1, reduction: 0.59 }],
          agreementUnmeasuredTotals: [{ currency: 'USD', items: 3 }],
        }),
      );
      render(<DiscountReportView token="tok" />);
      const summary = await screen.findByTestId('agreement-unmeasured-USD');
      expect(summary).toHaveTextContent(/^USD · 3 ítems de convenio sin referencia comparable$/);
      expect(screen.getByTestId('agreement-total-USD')).toHaveTextContent('USD · 1 ítem con rebaja de convenio');
    });

    it('solo filas sin medir: el resumen sale igual', async () => {
      mockedReport.mockResolvedValue(
        report([unmeasured()], { totals: [], agreementUnmeasuredTotals: [{ currency: 'USD', items: 1 }] }),
      );
      render(<DiscountReportView token="tok" />);
      expect(await screen.findByTestId('agreement-unmeasured-USD')).toHaveTextContent(
        'USD · 1 ítem de convenio sin referencia comparable',
      );
    });

    // DX-513-quater: lista de convenio con la moneda del catálogo NULL.
    it('moneda del catálogo desconocida: la frase propia, nunca «catálogo en ,», «Sin medir» y el resumen sin cifra', async () => {
      const unknownCatalog = () =>
        listAgreement({ itemId: 'item-3', catalogCurrency: null, basePriceInPlan: 3600, agreementUnmeasured: true });
      mockedReport.mockResolvedValue(
        report([unknownCatalog()], { totals: [], agreementUnmeasuredTotals: [{ currency: 'USD', items: 1 }] }),
      );
      render(<DiscountReportView token="tok" />);
      const tableRow = await findRow();
      expect(within(tableRow).getByText(/sin referencia comparable/)).toHaveTextContent(
        'Convenio «Empresa»: sin referencia comparable (moneda del catálogo desconocida, plan en USD)',
      );
      expect(screen.queryByText(/catálogo en ,/)).not.toBeInTheDocument();
      expect(within(tableRow).getByText('Sin medir')).toBeInTheDocument();
      expect(await screen.findByTestId('agreement-unmeasured-USD')).toHaveTextContent(
        /^USD · 1 ítem de convenio sin referencia comparable$/,
      );
      expect(screen.queryByTestId('agreement-total-USD')).not.toBeInTheDocument();
    });

    it('convenio por % con la moneda del catálogo NULL: se sigue midiendo', async () => {
      mockedReport.mockResolvedValue(
        report(
          [
            listAgreement({
              priceSource: 'AGREEMENT_PERCENT',
              catalogCurrency: null,
              basePrice: 3600,
              basePriceInPlan: 3600,
              catalogPrice: 3240,
              referencePriceInPlan: 3240,
              price: 3240,
              agreementReduction: 360,
              agreementPercent: 10,
            }),
          ],
          { totals: [], agreementTotals: [{ currency: 'USD', items: 1, reduction: 360 }] },
        ),
      );
      render(<DiscountReportView token="tok" />);
      const tableRow = await findRow();
      expect(within(tableRow).getByText(/Convenio «Empresa»/)).toHaveTextContent(
        /^Convenio «Empresa»: −360,00\sUSD \(10\s%\sde 3\.?600,00\sUSD\)$/,
      );
      expect(within(tableRow).queryByText('Sin medir')).not.toBeInTheDocument();
    });

    describe('teléfono (<640px)', () => {
      let restore: () => void;
      beforeEach(() => {
        restore = mockPhone();
      });
      afterEach(() => restore());

      it('la línea 2 lleva la frase neutra y el importe dice «Sin medir»', async () => {
        mockedReport.mockResolvedValue(report([measured(), unmeasured()], { totals: [] }));
        render(<DiscountReportView token="tok" />);
        const cards = within(await screen.findByRole('list', { name: 'Descuentos del periodo' })).getAllByRole(
          'listitem',
        );
        expect(cards[0]).toHaveTextContent(/Catálogo 3\.?600,00 VES · tasa 1 USD = 880 VES/);
        expect(within(cards[0]).getByTestId('discount-card-amount')).toHaveTextContent(/−\s?0,59/);
        expect(cards[1]).toHaveTextContent('Convenio «Empresa»: sin referencia comparable (catálogo en VES, plan en USD)');
        expect(within(cards[1]).getByTestId('discount-card-amount')).toHaveTextContent(/^Sin medir$/);
        expect(cards[1]).toHaveTextContent('Dado por: Dr. Owner');
      });
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
