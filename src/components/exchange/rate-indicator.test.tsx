import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { tokenForRole } from '@/lib/test/data-consents';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';
import { clearSessionStore } from '@/lib/session/session-store';
import {
  EXCHANGE_RATES_CHANGED_EVENT,
  getExchangeHeader,
  type ExchangeHeader,
} from '@/lib/exchange/exchange-header-api';
import { EXCHANGE_HEADER_POLL_MS, ExchangeHeaderProvider, ExchangeHeaderTestProvider } from './exchange-header-context';
import { RATE_SETTINGS_HREF, RateIndicator, rateIndicatorCopy as copy } from './rate-indicator';

jest.mock('../../lib/exchange/exchange-header-api', () => ({
  ...jest.requireActual('../../lib/exchange/exchange-header-api'),
  getExchangeHeader: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
const mockedHeader = jest.mocked(getExchangeHeader);

const usd = {
  currency: 'USD',
  perReference: 918.77,
  label: null,
  source: 'AUTOMATIC' as const,
  date: '2026-11-21',
  fetchedAt: '2026-11-21T13:00:00.000Z',
};
const eur = { ...usd, currency: 'EUR', perReference: 1001.5, label: '€' };

function header(overrides: Partial<ExchangeHeader> = {}): ExchangeHeader {
  return {
    visible: true,
    reference: 'VES',
    referenceLabel: 'Bs.',
    rates: [usd],
    acceptedCurrencies: ['USD', 'VES'],
    updatedAt: '2026-11-21T15:04:05.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  clearSessionStore();
  mockedHeader.mockReset();
  jest.mocked(listLocations).mockResolvedValue([clinicLocation({ currency: 'VES' })]);
});

function renderFixed(value: ExchangeHeader, role = 'RECEPTION', variant: 'block' | 'rail' | 'phone' = 'block') {
  return render(
    <ExchangeHeaderTestProvider value={{ status: 'ready', header: value }}>
      <RateIndicator token={tokenForRole(role)} variant={variant} />
    </ExchangeHeaderTestProvider>,
  );
}

describe('RateIndicator (DX-584)', () => {
  it('enseña «1 USD = 918,77 Bs.» con nombre accesible completo, en todas las variantes', async () => {
    for (const variant of ['block', 'rail', 'phone'] as const) {
      const view = renderFixed(header(), 'RECEPTION', variant);
      const button = await screen.findByRole('button', {
        name: 'Tasa de hoy: 1 USD = 918,77 Bs., fuente automática',
      });
      expect(button).toHaveAttribute('data-testid', 'rate-indicator');
      if (variant === 'block') expect(button).toHaveTextContent('1 USD = 918,77 Bs.');
      view.unmount();
    }
  });

  it('con varias: la primera + «+1»; el popover las lista con fuente y día, y Escape lo cierra', async () => {
    const user = userEvent.setup();
    renderFixed(header({ rates: [usd, { ...eur, source: 'MANUAL', fetchedAt: null }] }));
    const button = await screen.findByRole('button', {
      name: /^Tasa de hoy: 1 USD = 918,77 Bs\., fuente automática, y 1 moneda más$/,
    });
    expect(button).toHaveTextContent('+1');
    await user.click(button);
    const popover = await screen.findByTestId('rate-indicator-popover');
    expect(within(popover).getByText('1 € = 1.001,50 Bs.')).toBeInTheDocument();
    expect(within(popover).getByText('Manual · del 21/11/2026')).toBeInTheDocument();
    expect(within(popover).getByText('Automática · del 21/11/2026')).toBeInTheDocument();
    // Solo ADMIN ve el enlace a Ajustes.
    expect(within(popover).queryByRole('link')).toBeNull();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('rate-indicator-popover')).toBeNull());
    expect(button).toHaveFocus();
  });

  it('ADMIN: el popover lleva a Ajustes › Tasa de cambio', async () => {
    const user = userEvent.setup();
    renderFixed(header(), 'ADMIN');
    await user.click(await screen.findByTestId('rate-indicator'));
    expect(await screen.findByRole('link', { name: copy.settings })).toHaveAttribute('href', RATE_SETTINGS_HREF);
  });

  it('sin tasa: «Sin tasa hoy» en tono de aviso, con la moneda en el nombre', async () => {
    renderFixed(header({ rates: [{ ...usd, perReference: null, fetchedAt: null }] }));
    const button = await screen.findByRole('button', { name: 'Sin tasa hoy: falta la de 1 USD en Bs.' });
    expect(within(button).getByText(copy.missing)).toHaveClass('text-warning-text');
  });

  it('una moneda fuerte frente a la de referencia no sale «0,00»', async () => {
    renderFixed(
      header({
        reference: 'USD',
        referenceLabel: null,
        rates: [{ ...usd, currency: 'VES', label: 'Bs.', perReference: 0.00108843 }],
      }),
    );
    expect(await screen.findByRole('button', { name: /1 Bs\. = 0,001088 USD/ })).toBeInTheDocument();
  });

  it('no pinta nada con visible: false, sin filas, cargando o con error', () => {
    const { container, rerender } = renderFixed(header({ visible: false, rates: [] }));
    expect(container).toBeEmptyDOMElement();
    for (const value of [{ status: 'loading' as const }, { status: 'error' as const }]) {
      rerender(
        <ExchangeHeaderTestProvider value={value}>
          <RateIndicator token={tokenForRole('ADMIN')} variant="block" />
        </ExchangeHeaderTestProvider>,
      );
      expect(container).toBeEmptyDOMElement();
    }
  });
});

describe('ExchangeHeaderProvider (DX-584)', () => {
  function renderProvider() {
    return render(
      <ExchangeHeaderProvider token={tokenForRole('RECEPTION')}>
        <RateIndicator token={tokenForRole('RECEPTION')} variant="block" />
      </ExchangeHeaderProvider>,
    );
  }

  it('relee con EXCHANGE_RATES_CHANGED_EVENT (guardar una tasa o las monedas)', async () => {
    mockedHeader
      .mockResolvedValueOnce(header())
      .mockResolvedValueOnce(header({ rates: [{ ...usd, perReference: 920 }] }));
    renderProvider();
    expect(await screen.findByText('1 USD = 918,77 Bs.')).toBeInTheDocument();
    act(() => window.dispatchEvent(new Event(EXCHANGE_RATES_CHANGED_EVENT)));
    expect(await screen.findByText('1 USD = 920,00 Bs.')).toBeInTheDocument();
    expect(mockedHeader).toHaveBeenCalledTimes(2);
  });

  it('un fallo al releer deja lo último bueno', async () => {
    mockedHeader.mockResolvedValueOnce(header()).mockRejectedValueOnce(new Error('red'));
    renderProvider();
    expect(await screen.findByText('1 USD = 918,77 Bs.')).toBeInTheDocument();
    act(() => window.dispatchEvent(new Event(EXCHANGE_RATES_CHANGED_EVENT)));
    await waitFor(() => expect(mockedHeader).toHaveBeenCalledTimes(2));
    expect(screen.getByText('1 USD = 918,77 Bs.')).toBeInTheDocument();
  });

  it('se oculta si la clínica pasa a «Nunca»', async () => {
    mockedHeader.mockResolvedValueOnce(header()).mockResolvedValueOnce(header({ visible: false, rates: [] }));
    renderProvider();
    expect(await screen.findByTestId('rate-indicator')).toBeInTheDocument();
    act(() => window.dispatchEvent(new Event(EXCHANGE_RATES_CHANGED_EVENT)));
    await waitFor(() => expect(screen.queryByTestId('rate-indicator')).toBeNull());
  });

  it('al volver el foco a la pestaña relee (no dos veces seguidas) y cada 5 min con la pestaña visible', async () => {
    jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick'] });
    const setVisibility = (state: DocumentVisibilityState) =>
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
    try {
      mockedHeader.mockResolvedValue(header());
      renderProvider();
      await act(async () => {});
      expect(mockedHeader).toHaveBeenCalledTimes(1);

      // Recién leído: el foco no repite la lectura.
      await act(async () => {
        window.dispatchEvent(new Event('focus'));
      });
      expect(mockedHeader).toHaveBeenCalledTimes(1);

      // Con la pestaña oculta no se sondea.
      setVisibility('hidden');
      await act(async () => {
        jest.advanceTimersByTime(EXCHANGE_HEADER_POLL_MS);
      });
      expect(mockedHeader).toHaveBeenCalledTimes(1);

      // Al volver, relee al momento; `focus` justo después no la repite.
      setVisibility('visible');
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('focus'));
      });
      expect(mockedHeader).toHaveBeenCalledTimes(2);

      await act(async () => {
        jest.advanceTimersByTime(EXCHANGE_HEADER_POLL_MS);
      });
      expect(mockedHeader).toHaveBeenCalledTimes(3);
    } finally {
      setVisibility('visible');
      jest.useRealTimers();
    }
  });
});

describe('RateIndicatorSlot (DX-584)', () => {
  it('baja el indicador solo cuando la clínica lo enseña', async () => {
    const { RateIndicatorSlot } = await import('./rate-indicator-slot');
    const { container, rerender } = render(
      <ExchangeHeaderTestProvider value={{ status: 'ready', header: header({ visible: false, rates: [] }) }}>
        <RateIndicatorSlot token={tokenForRole('ADMIN')} variant="block" />
      </ExchangeHeaderTestProvider>,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(
      <ExchangeHeaderTestProvider value={{ status: 'ready', header: header() }}>
        <RateIndicatorSlot token={tokenForRole('ADMIN')} variant="block" />
      </ExchangeHeaderTestProvider>,
    );
    expect(await screen.findByTestId('rate-indicator')).toHaveTextContent('1 USD = 918,77 Bs.');
  });
});
