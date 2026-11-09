import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlanQuotePrintView } from './plan-quote-print-view';
import { getPlanQuote, issuePlanQuote } from '@/lib/treatment-plans/plan-quote-api';
import { ApiError } from '@/lib/api/client';
import { planQuoteFixture } from './plan-quote-fixture';
import { getExchangeRates } from '@/lib/exchange/exchange-api';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';
import { SEDE_LOCALE_ERROR } from '@/lib/locations/use-sede-format';
import { getPlan, type TreatmentPlan } from '@/lib/treatment-plans/treatment-plans-api';
import { SIGNED_ACCEPTANCE } from './plan-quote-fixture';

jest.mock('../../lib/treatment-plans/plan-quote-api', () => ({
  ...jest.requireActual('../../lib/treatment-plans/plan-quote-api'),
  getPlanQuote: jest.fn(),
  issuePlanQuote: jest.fn(),
}));

jest.mock('../../lib/treatment-plans/treatment-plans-api', () => ({
  ...jest.requireActual('../../lib/treatment-plans/treatment-plans-api'),
  getPlan: jest.fn(),
}));

jest.mock('../../lib/exchange/exchange-api', () => ({
  getExchangeRates: jest.fn(),
}));
jest.mock('../../lib/reference/currencies-api', () => ({
  listCurrencies: jest.fn().mockResolvedValue([
    { code: 'VES', name: 'Bolívar', symbol: 'Bs.' },
    { code: 'USD', name: 'Dólar', symbol: 'US$' },
  ]),
}));
jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest.fn(),
}));

// DX-379: la vista de impresión pide el presupuesto con POST …/quote/issue
// (la primera impresión fija la validez); el GET queda para ver y aceptar.
const mockedIssue = issuePlanQuote as jest.MockedFunction<typeof issuePlanQuote>;
const mockedPlainGet = jest.mocked(getPlanQuote);
const mockedRates = getExchangeRates as jest.MockedFunction<typeof getExchangeRates>;

function renderView(props: Partial<React.ComponentProps<typeof PlanQuotePrintView>> = {}) {
  return render(
    <PlanQuotePrintView
      token="tok"
      patientId="p1"
      planId="plan-1"
      backHref="/patients/p1?tab=treatment-plans"
      {...props}
    />,
  );
}

describe('PlanQuotePrintView (DX-012)', () => {
  const print = jest.fn();
  beforeEach(() => {
    mockedIssue.mockReset();
    mockedPlainGet.mockReset();
    print.mockReset();
    window.print = print;
    jest.mocked(listLocations).mockResolvedValue([clinicLocation({ currency: 'VES' })]);
    mockedRates.mockReset();
    jest.mocked(getPlan).mockReset().mockResolvedValue({ splitFromPlanId: null } as TreatmentPlan);
  });

  describe('DX-417: el presupuesto pendiente de una aceptación parcial', () => {
    it('lleva «Resto de la aceptación parcial del …» con el día de la aceptación del original, antes de imprimir', async () => {
      mockedIssue.mockResolvedValue(planQuoteFixture({ planStatus: 'PRESENTED' }));
      jest.mocked(getPlan).mockImplementation(async (_t, id) =>
        (id === 'plan-1'
          ? { id: 'plan-1', splitFromPlanId: 'plan-0' }
          : { id: 'plan-0', acceptedAt: '2026-10-20T15:00:00.000Z' }) as TreatmentPlan,
      );
      renderView();
      expect(await screen.findByTestId('quote-partial-rest')).toHaveTextContent(
        'Resto de la aceptación parcial del 20/10/2026',
      );
      expect(getPlan).toHaveBeenCalledWith('tok', 'plan-0');
      expect(print).toHaveBeenCalledTimes(1);
    });

    it('sin acceso al plan (recepción: 403) se imprime igual, sin la línea', async () => {
      mockedIssue.mockResolvedValue(planQuoteFixture({ planStatus: 'PRESENTED' }));
      jest.mocked(getPlan).mockRejectedValue(new ApiError(403, 'No'));
      renderView();
      expect(await screen.findByTestId('quote-header')).toBeInTheDocument();
      await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
      expect(screen.queryByTestId('quote-partial-rest')).not.toBeInTheDocument();
    });

    it('un pendiente ya firmado no busca el original ni lleva la línea', async () => {
      mockedIssue.mockResolvedValue(planQuoteFixture({ planStatus: 'ACCEPTED', acceptance: SIGNED_ACCEPTANCE }));
      jest.mocked(getPlan).mockResolvedValue({ id: 'plan-1', splitFromPlanId: 'plan-0' } as TreatmentPlan);
      renderView();
      expect(await screen.findByTestId('quote-header')).toBeInTheDocument();
      expect(getPlan).not.toHaveBeenCalledWith('tok', 'plan-0');
      expect(screen.queryByTestId('quote-partial-rest')).not.toBeInTheDocument();
    });
  });

  describe('DX-376: segunda moneda opcional', () => {
    it('sin elegir no pide tasas; al elegir una pinta su total con la tasa de hoy en la sede', async () => {
      mockedIssue.mockResolvedValue(planQuoteFixture());
      mockedRates.mockImplementation((_token, date) =>
        Promise.resolve({
          base: 'USD',
          source: 'AUTOMATIC',
          rates: { VES: 4000 },
          rateDate: date,
        }),
      );
      renderView();
      await screen.findByTestId('quote-header');
      expect(mockedRates).not.toHaveBeenCalled();
      const select = screen.getByLabelText('Segunda moneda (opcional)');
      await screen.findByRole('option', { name: /Dólar/ });
      await userEvent.selectOptions(select, 'USD');
      const total = await screen.findByTestId('quote-second-total');
      expect((total.textContent ?? '').replace(/\s/g, ' ')).toContain('USD 825,00');
      expect(mockedRates).toHaveBeenCalledWith('tok', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
      expect(screen.getByTestId('quote-second-currency')).toHaveTextContent(/automática/);
    });

    it('sin tasa de hoy lo dice y no imprime la segunda moneda', async () => {
      mockedIssue.mockResolvedValue(planQuoteFixture());
      mockedRates.mockImplementation((_token, date) =>
        Promise.resolve({
          base: 'USD',
          source: 'MANUAL',
          rates: {},
          rateDate: date,
        }),
      );
      renderView();
      await screen.findByTestId('quote-header');
      await screen.findByRole('option', { name: /Dólar/ });
      await userEvent.selectOptions(screen.getByLabelText('Segunda moneda (opcional)'), 'USD');
      expect(await screen.findByText(/no hay tasa de VES para hoy/i)).toBeInTheDocument();
      expect(screen.queryByTestId('quote-second-total')).not.toBeInTheDocument();
    });

    it('si falla la consulta lo dice con reintento', async () => {
      mockedIssue.mockResolvedValue(planQuoteFixture());
      mockedRates.mockRejectedValueOnce(new Error('red')).mockResolvedValueOnce({
        base: 'USD',
        source: 'AUTOMATIC',
        rates: { VES: 4000 },
        rateDate: '2026-10-30',
      });
      renderView();
      await screen.findByTestId('quote-header');
      await screen.findByRole('option', { name: /Dólar/ });
      await userEvent.selectOptions(screen.getByLabelText('Segunda moneda (opcional)'), 'USD');
      await userEvent.click(await screen.findByRole('button', { name: 'Reintentar la consulta de la tasa' }));
      expect(await screen.findByTestId('quote-second-total')).toBeInTheDocument();
    });

    it('sin la zona de la sede no se queda «consultando» para siempre: lo dice con reintento', async () => {
      mockedIssue.mockResolvedValue(planQuoteFixture());
      jest.mocked(listLocations).mockRejectedValue(new Error('red'));
      renderView();
      await screen.findByTestId('quote-header');
      await screen.findByRole('option', { name: /Dólar/ });
      await userEvent.selectOptions(screen.getByLabelText('Segunda moneda (opcional)'), 'USD');
      expect(await screen.findByText(/zona horaria de la sede/i)).toBeInTheDocument();
      expect(screen.queryByText('Consultando la tasa de hoy…')).not.toBeInTheDocument();
      expect(mockedRates).not.toHaveBeenCalled();
    });
  });

  it('muestra la carga, pinta el documento y abre el diálogo de impresión una vez', async () => {
    mockedIssue.mockResolvedValue(planQuoteFixture());
    renderView();
    expect(screen.getByRole('status')).toHaveTextContent('Preparando el presupuesto…');
    expect(await screen.findByTestId('quote-header')).toBeInTheDocument();
    expect(mockedIssue).toHaveBeenCalledWith('tok', 'p1', 'plan-1');
    // DX-379: imprimir fija la validez (POST issue), no el GET de solo lectura.
    expect(mockedPlainGet).not.toHaveBeenCalled();
    expect(print).toHaveBeenCalledTimes(1);
    expect(document.title).toBe('Presupuesto · Ana Pérez');
    const back = screen.getByRole('link', { name: /Volver/ });
    expect(back).toHaveAttribute('href', '/patients/p1?tab=treatment-plans');
    await userEvent.click(screen.getByRole('button', { name: 'Imprimir o guardar como PDF' }));
    expect(print).toHaveBeenCalledTimes(2);
  });

  it('un fallo de red es un error de sección con reintento', async () => {
    mockedIssue.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(planQuoteFixture());
    renderView();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No pudimos cargar el presupuesto.');
    await userEvent.click(screen.getByRole('button', { name: /reintentar|intentar de nuevo/i }));
    expect(await screen.findByTestId('quote-header')).toBeInTheDocument();
    expect(mockedIssue).toHaveBeenCalledTimes(2);
  });

  it('404: aviso sin reintento (reintentar no lo arregla)', async () => {
    mockedIssue.mockRejectedValue(new ApiError(404, 'Plan de tratamiento no encontrado'));
    renderView();
    expect(await screen.findByText('No encontramos este presupuesto.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(print).not.toHaveBeenCalled();
  });

  it('403 de la API: aviso de acceso', async () => {
    mockedIssue.mockRejectedValue(new ApiError(403, 'Insufficient role'));
    renderView();
    expect(await screen.findByText('Tu rol no tiene acceso a este presupuesto.')).toBeInTheDocument();
  });

  it('sin permiso no pide nada', () => {
    renderView({ allowed: false });
    expect(screen.getByText('Tu rol no tiene acceso a este presupuesto.')).toBeInTheDocument();
    expect(mockedIssue).not.toHaveBeenCalled();
  });

  it('si el presupuesto es de otro paciente no se imprime bajo esta ficha', async () => {
    mockedIssue.mockResolvedValue(planQuoteFixture({ patientId: 'otro' }));
    renderView();
    expect(await screen.findByText('No encontramos este presupuesto.')).toBeInTheDocument();
    await waitFor(() => expect(print).not.toHaveBeenCalled());
  });

  describe('DX-489/DX-502: el precio de lista en la moneda del catálogo', () => {
    // DX-502: la moneda llega con cada ítem del presupuesto (la congelada al
    // darlo de alta), no se deduce de las sedes.
    const eurQuote = () =>
      planQuoteFixture({
        currency: 'EUR',
        items: [
          {
            ...planQuoteFixture().items[0],
            unitPrice: 100.55,
            discount: 0,
            subtotal: 100.55,
            listPrice: 80000,
            agreementName: 'Plan Oro',
            listPriceCurrency: 'VES',
          },
        ],
        totals: [{ currency: 'EUR', gross: 100.55, discount: 0, net: 100.55, agreementSaving: 79899.45 }],
      });
    const flat = (el: HTMLElement) => (el.textContent ?? '').replace(/\s/g, ' ');

    it('plan en EUR con el catálogo en VES: lo que se imprime lleva el precio de lista en VES y sin ahorro', async () => {
      mockedIssue.mockResolvedValue(eurQuote());
      renderView();
      const table = await screen.findByRole('table', { name: 'Procedimientos del presupuesto' });
      expect(flat(table)).toContain('Precio de lista VES 80.000,00');
      expect(flat(table)).not.toContain('EUR 80.000,00');
      expect(screen.getByTestId('quote-list-price-note')).toHaveTextContent(
        'El precio de lista es el del catálogo de la clínica, en VES: es de referencia y no se convierte a EUR.',
      );
      expect(screen.queryByText('Ahorro por convenio')).not.toBeInTheDocument();
      expect(print).toHaveBeenCalledTimes(1);
    });

    it('no depende de las sedes: aunque no carguen o estén en otra moneda, imprime la moneda del presupuesto', async () => {
      jest.mocked(listLocations).mockRejectedValue(new Error('red'));
      mockedIssue.mockResolvedValue(eurQuote());
      renderView();
      const table = await screen.findByRole('table', { name: 'Procedimientos del presupuesto' });
      expect(flat(table)).toContain('Precio de lista VES 80.000,00');
      expect(screen.queryByTestId('quote-locations-error')).not.toBeInTheDocument();
      expect(print).toHaveBeenCalledTimes(1);
    });
  });

  describe('DX-354: el formato de la sede del presupuesto', () => {
    it('usa la sede del presupuesto, no la activa; sin ella «—», el aviso fuera del papel y Reintentar lo vuelve a leer', async () => {
      mockedIssue.mockResolvedValueOnce(planQuoteFixture({ regional: null }));
      mockedIssue.mockResolvedValueOnce(
        planQuoteFixture({ regional: { timeZone: 'America/New_York', locale: 'en-US', hourCycle: 'h12' } }),
      );
      renderView();
      const header = await screen.findByTestId('quote-header');
      expect(header).toHaveTextContent('—');
      expect(header.textContent).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
      const note = screen.getByText(SEDE_LOCALE_ERROR).closest('[role="status"]');
      expect(note?.closest('.print\\:hidden')).not.toBeNull();
      expect(print).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: /imprimir/i })).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
      await waitFor(() => expect(screen.getByTestId('quote-header')).toHaveTextContent('10/16/2026'));
      expect(screen.queryByText(SEDE_LOCALE_ERROR)).not.toBeInTheDocument();
    });
  });
});
