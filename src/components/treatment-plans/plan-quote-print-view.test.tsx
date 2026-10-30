import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlanQuotePrintView } from './plan-quote-print-view';
import { getPlanQuote } from '@/lib/treatment-plans/plan-quote-api';
import { ApiError } from '@/lib/api/client';
import { planQuoteFixture } from './plan-quote-fixture';
import { getExchangeRates } from '@/lib/exchange/exchange-api';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';

jest.mock('../../lib/treatment-plans/plan-quote-api', () => ({
  ...jest.requireActual('../../lib/treatment-plans/plan-quote-api'),
  getPlanQuote: jest.fn(),
}));

jest.mock('../../lib/exchange/exchange-api', () => ({
  getExchangeRates: jest.fn(),
}));
jest.mock('../../lib/reference/currencies-api', () => ({
  listCurrencies: jest.fn().mockResolvedValue([
    { code: 'COP', name: 'Peso', symbol: '$' },
    { code: 'USD', name: 'Dólar', symbol: 'US$' },
  ]),
}));
jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest.fn(),
}));

const mockedGet = getPlanQuote as jest.MockedFunction<typeof getPlanQuote>;
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
    mockedGet.mockReset();
    print.mockReset();
    window.print = print;
    jest.mocked(listLocations).mockResolvedValue([clinicLocation()]);
    mockedRates.mockReset();
  });

  describe('DX-376: segunda moneda opcional', () => {
    it('sin elegir no pide tasas; al elegir una pinta su total con la tasa de hoy en la sede', async () => {
      mockedGet.mockResolvedValue(planQuoteFixture());
      mockedRates.mockResolvedValue({ base: 'USD', source: 'AUTOMATIC', rates: { COP: 4000 } });
      renderView();
      await screen.findByTestId('quote-header');
      expect(mockedRates).not.toHaveBeenCalled();
      const select = screen.getByLabelText('Segunda moneda (opcional)');
      await screen.findByRole('option', { name: /Dólar/ });
      await userEvent.selectOptions(select, 'USD');
      const total = await screen.findByTestId('quote-second-total');
      expect((total.textContent ?? '').replace(/\s/g, ' ')).toContain('825,00 US$');
      expect(mockedRates).toHaveBeenCalledWith('tok', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
      expect(screen.getByTestId('quote-second-currency')).toHaveTextContent(/automática/);
    });

    it('sin tasa de hoy lo dice y no imprime la segunda moneda', async () => {
      mockedGet.mockResolvedValue(planQuoteFixture());
      mockedRates.mockResolvedValue({ base: 'USD', source: 'MANUAL', rates: {} });
      renderView();
      await screen.findByTestId('quote-header');
      await screen.findByRole('option', { name: /Dólar/ });
      await userEvent.selectOptions(screen.getByLabelText('Segunda moneda (opcional)'), 'USD');
      expect(await screen.findByText(/no hay tasa de COP para hoy/i)).toBeInTheDocument();
      expect(screen.queryByTestId('quote-second-total')).not.toBeInTheDocument();
    });

    it('si falla la consulta lo dice con reintento', async () => {
      mockedGet.mockResolvedValue(planQuoteFixture());
      mockedRates
        .mockRejectedValueOnce(new Error('red'))
        .mockResolvedValueOnce({ base: 'USD', source: 'AUTOMATIC', rates: { COP: 4000 } });
      renderView();
      await screen.findByTestId('quote-header');
      await screen.findByRole('option', { name: /Dólar/ });
      await userEvent.selectOptions(screen.getByLabelText('Segunda moneda (opcional)'), 'USD');
      await userEvent.click(await screen.findByRole('button', { name: 'Reintentar la consulta de la tasa' }));
      expect(await screen.findByTestId('quote-second-total')).toBeInTheDocument();
    });

    it('sin la zona de la sede no se queda «consultando» para siempre: lo dice con reintento', async () => {
      mockedGet.mockResolvedValue(planQuoteFixture());
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
    mockedGet.mockResolvedValue(planQuoteFixture());
    renderView();
    expect(screen.getByRole('status')).toHaveTextContent('Preparando el presupuesto…');
    expect(await screen.findByTestId('quote-header')).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledWith('tok', 'p1', 'plan-1');
    expect(print).toHaveBeenCalledTimes(1);
    expect(document.title).toBe('Presupuesto · Ana Pérez');
    const back = screen.getByRole('link', { name: /Volver/ });
    expect(back).toHaveAttribute('href', '/patients/p1?tab=treatment-plans');
    await userEvent.click(screen.getByRole('button', { name: 'Imprimir o guardar como PDF' }));
    expect(print).toHaveBeenCalledTimes(2);
  });

  it('un fallo de red es un error de sección con reintento', async () => {
    mockedGet.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(planQuoteFixture());
    renderView();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No pudimos cargar el presupuesto.');
    await userEvent.click(screen.getByRole('button', { name: /reintentar|intentar de nuevo/i }));
    expect(await screen.findByTestId('quote-header')).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('404: aviso sin reintento (reintentar no lo arregla)', async () => {
    mockedGet.mockRejectedValue(new ApiError(404, 'Plan de tratamiento no encontrado'));
    renderView();
    expect(await screen.findByText('No encontramos este presupuesto.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(print).not.toHaveBeenCalled();
  });

  it('403 de la API: aviso de acceso', async () => {
    mockedGet.mockRejectedValue(new ApiError(403, 'Insufficient role'));
    renderView();
    expect(await screen.findByText('Tu rol no tiene acceso a este presupuesto.')).toBeInTheDocument();
  });

  it('sin permiso no pide nada', () => {
    renderView({ allowed: false });
    expect(screen.getByText('Tu rol no tiene acceso a este presupuesto.')).toBeInTheDocument();
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('si el presupuesto es de otro paciente no se imprime bajo esta ficha', async () => {
    mockedGet.mockResolvedValue(planQuoteFixture({ patientId: 'otro' }));
    renderView();
    expect(await screen.findByText('No encontramos este presupuesto.')).toBeInTheDocument();
    await waitFor(() => expect(print).not.toHaveBeenCalled());
  });
});
