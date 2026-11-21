import { act, cleanup as cleanupAll, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { tokenForRole } from '@/lib/test/data-consents';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';
import { clearSessionStore } from '@/lib/session/session-store';
import {
  EXCHANGE_RATES_CHANGED_EVENT,
  getExchangeHeader,
  refreshExchangeRates,
  type ExchangeHeader,
} from '@/lib/exchange/exchange-header-api';
import { ApiError } from '@/lib/api/api-error';
import { resetRateRefreshForTests } from '@/lib/exchange/rate-refresh-store';
import { rateRefreshCopy } from './rate-refresh-control';
import { EXCHANGE_HEADER_POLL_MS, ExchangeHeaderProvider, ExchangeHeaderTestProvider } from './exchange-header-context';
import { RATE_REGISTER_HREF, RATE_SETTINGS_HREF, RateIndicator, rateIndicatorCopy as copy } from './rate-indicator';

jest.mock('../../lib/exchange/exchange-header-api', () => ({
  ...jest.requireActual('../../lib/exchange/exchange-header-api'),
  getExchangeHeader: jest.fn(),
  refreshExchangeRates: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
const mockedHeader = jest.mocked(getExchangeHeader);
const mockedRefresh = jest.mocked(refreshExchangeRates);

const usd = {
  currency: 'USD',
  perReference: 918.77,
  label: null,
  source: 'AUTOMATIC' as const,
  date: '2026-11-21',
  fetchedAt: '2026-11-21T13:00:00.000Z',
  valueDate: null as string | null,
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
  mockedRefresh.mockReset();
  resetRateRefreshForTests();
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

  it('DX-585: con BCV, «BCV» y la fecha valor en el nombre y en el popover; una moneda del proveedor, «Automática»', async () => {
    const user = userEvent.setup();
    const bcvUsd = { ...usd, source: 'BCV' as const, perReference: 918.7662, valueDate: '2026-11-20' };
    // BRL no sale del BCV: la API no le da fecha valor y su cifra es la del proveedor.
    const brl = { ...usd, currency: 'BRL', label: null, perReference: 0.2301, source: 'BCV' as const };
    renderFixed(header({ rates: [bcvUsd, brl] }), 'ADMIN');
    const button = await screen.findByRole('button', {
      name: 'Tasa de hoy: 1 USD = 918,77 Bs., fuente BCV, fecha valor 20/11/2026, y 1 moneda más',
    });
    await user.click(button);
    const popover = await screen.findByTestId('rate-indicator-popover');
    expect(within(popover).getByText('BCV · fecha valor 20/11/2026')).toBeInTheDocument();
    expect(within(popover).getByText('Automática · del 21/11/2026')).toBeInTheDocument();
  });

  it('DX-585: con BCV y sin fecha valor en la fila (la referencia no es VES ni EUR), «automática»', async () => {
    renderFixed(header({ rates: [{ ...usd, source: 'BCV' }] }));
    expect(
      await screen.findByRole('button', { name: 'Tasa de hoy: 1 USD = 918,77 Bs., fuente automática' }),
    ).toBeInTheDocument();
  });

  it('DX-585: las etiquetas de fuente cubren todas las fuentes', () => {
    expect(copy.source).toEqual({ AUTOMATIC: 'automática', MANUAL: 'manual', BCV: 'BCV' });
    expect(copy.sourceLabel.BCV).toBe('BCV');
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

describe('«Actualizar tasa» (DX-586)', () => {
  async function openPopover(value: ExchangeHeader, role: string) {
    const user = userEvent.setup();
    renderFixed(value, role);
    await user.click(await screen.findByTestId('rate-indicator'));
    return { user, popover: await screen.findByTestId('rate-indicator-popover') };
  }

  it('recepción la actualiza: carga, «Tasa actualizada.», el menú se relee y queda deshabilitado 5 min', async () => {
    const onChanged = jest.fn();
    window.addEventListener(EXCHANGE_RATES_CHANGED_EVENT, onChanged);
    let resolve: (v: Awaited<ReturnType<typeof refreshExchangeRates>>) => void = () => {};
    mockedRefresh.mockImplementation(() => new Promise((r) => (resolve = r)));
    const { user, popover } = await openPopover(header(), 'RECEPTION');
    const button = within(popover).getByRole('button', { name: rateRefreshCopy.refresh });
    await user.click(button);
    expect(await within(popover).findByRole('button', { name: rateRefreshCopy.refreshing })).toBeDisabled();
    await act(async () => resolve({ ...header(), refresh: { ok: true, code: null, message: null } }));
    expect(await within(popover).findByRole('status')).toHaveTextContent(rateRefreshCopy.done);
    expect(onChanged).toHaveBeenCalledTimes(1);
    const again = within(popover).getByRole('button', { name: rateRefreshCopy.refresh });
    expect(again).toBeDisabled();
    expect(again).toHaveAccessibleDescription(rateRefreshCopy.wait(5));
    expect(mockedRefresh).toHaveBeenCalledWith(tokenForRole('RECEPTION'));
    window.removeEventListener(EXCHANGE_RATES_CHANGED_EVENT, onChanged);
  });

  it('si la fuente no da la tasa, dice el mensaje de la API y no relee el menú', async () => {
    const onChanged = jest.fn();
    window.addEventListener(EXCHANGE_RATES_CHANGED_EVENT, onChanged);
    const message = 'No pudimos consultar el BCV ni su respaldo. Se sigue usando la última tasa guardada.';
    mockedRefresh.mockResolvedValue({
      ...header(),
      refresh: { ok: false, code: 'EXCHANGE_RATE_UNAVAILABLE', message },
    });
    const { user, popover } = await openPopover(header(), 'ADMIN');
    await user.click(within(popover).getByRole('button', { name: rateRefreshCopy.refresh }));
    expect(await within(popover).findByRole('status')).toHaveTextContent(message);
    expect(onChanged).not.toHaveBeenCalled();
    window.removeEventListener(EXCHANGE_RATES_CHANGED_EVENT, onChanged);
  });

  it('un 429 dice cuándo volver a intentarlo y deshabilita el botón ese tiempo', async () => {
    mockedRefresh.mockRejectedValue(
      new ApiError(429, 'Vuelve a intentarlo en 3 min.', {
        retryAfterSeconds: 180,
        code: 'EXCHANGE_RATE_REFRESH_TOO_SOON',
      }),
    );
    const { user, popover } = await openPopover(header(), 'RECEPTION');
    await user.click(within(popover).getByRole('button', { name: rateRefreshCopy.refresh }));
    await waitFor(() => expect(within(popover).getByRole('button', { name: rateRefreshCopy.refresh })).toBeDisabled());
    expect(within(popover).getByRole('button', { name: rateRefreshCopy.refresh })).toHaveAccessibleDescription(
      rateRefreshCopy.wait(3),
    );
  });

  it('el turno vale para todos los indicadores: al reabrir sigue deshabilitado', async () => {
    mockedRefresh.mockResolvedValue({ ...header(), refresh: { ok: true, code: null, message: null } });
    const { user, popover } = await openPopover(header(), 'RECEPTION');
    await user.click(within(popover).getByRole('button', { name: rateRefreshCopy.refresh }));
    await within(popover).findByText(rateRefreshCopy.done);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('rate-indicator-popover')).toBeNull());
    await user.click(screen.getByTestId('rate-indicator'));
    const reopened = await screen.findByTestId('rate-indicator-popover');
    expect(within(reopened).getByRole('button', { name: rateRefreshCopy.refresh })).toBeDisabled();
  });

  it('DENTIST y ASSISTANT sin permiso de cobro no lo ven', async () => {
    for (const role of ['DENTIST', 'ASSISTANT']) {
      const user = userEvent.setup();
      const view = renderFixed(header(), role);
      await user.click(await screen.findByTestId('rate-indicator'));
      const popover = await screen.findByTestId('rate-indicator-popover');
      expect(within(popover).queryByRole('button', { name: rateRefreshCopy.refresh })).toBeNull();
      view.unmount();
    }
  });

  it('con tasa manual no hay nada que consultar: ADMIN tiene «Registrar tasa»; recepción, quién la registra', async () => {
    const manual = header({ rates: [{ ...usd, source: 'MANUAL' }] });
    const admin = await openPopover(manual, 'ADMIN');
    expect(within(admin.popover).queryByRole('button', { name: rateRefreshCopy.refresh })).toBeNull();
    expect(within(admin.popover).getByRole('link', { name: copy.registerManual })).toHaveAttribute(
      'href',
      RATE_REGISTER_HREF,
    );
    await admin.user.keyboard('{Escape}');
    cleanupAll();
    const reception = await openPopover(manual, 'RECEPTION');
    expect(within(reception.popover).queryByRole('button', { name: rateRefreshCopy.refresh })).toBeNull();
    expect(within(reception.popover).queryByRole('link')).toBeNull();
    expect(reception.popover).toHaveTextContent(copy.manualByAdmin);
  });
});
