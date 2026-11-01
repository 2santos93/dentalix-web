import { act, renderHook, waitFor } from '@testing-library/react';
import { usePriceQuote } from './use-price-quote';
import { getPriceQuote, type PriceQuote } from '@/lib/patients/patient-agreement-api';

jest.mock('../patients/patient-agreement-api', () => ({ getPriceQuote: jest.fn() }));
const mocked = getPriceQuote as jest.MockedFunction<typeof getPriceQuote>;

const quote = (price: number): PriceQuote => ({
  basePrice: 100,
  catalogCurrency: 'COP',
  price,
  source: 'CATALOG',
  agreementId: null,
  agreementName: null,
  allowDiscount: true,
  currency: 'COP',
});

function deferred() {
  let resolve!: (q: PriceQuote) => void;
  const promise = new Promise<PriceQuote>((r) => (resolve = r));
  return { promise, resolve };
}

describe('usePriceQuote (DX-105)', () => {
  beforeEach(() => mocked.mockReset());

  it('sin prestación o sin moneda no pide nada', () => {
    const { result } = renderHook(() =>
      usePriceQuote({ token: 't', patientId: 'p', catalogItemId: '', currency: 'COP' }),
    );
    expect(result.current.status).toBe('idle');
    expect(mocked).not.toHaveBeenCalled();
  });

  it('carga y entrega el precio una vez', async () => {
    mocked.mockResolvedValue(quote(80));
    const onSettled = jest.fn();
    const { result } = renderHook(() =>
      usePriceQuote({ token: 't', patientId: 'p', catalogItemId: 'c1', currency: 'COP', onSettled }),
    );
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.quote?.price).toBe(80);
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledWith(quote(80));
  });

  it('descarta la respuesta de una prestación anterior', async () => {
    const first = deferred();
    mocked.mockReturnValueOnce(first.promise).mockResolvedValueOnce(quote(30));
    const onSettled = jest.fn();
    const { result, rerender } = renderHook(
      ({ id }) => usePriceQuote({ token: 't', patientId: 'p', catalogItemId: id, currency: 'COP', onSettled }),
      { initialProps: { id: 'c1' } },
    );
    rerender({ id: 'c2' });
    await waitFor(() => expect(result.current.quote?.price).toBe(30));
    await act(async () => first.resolve(quote(999)));
    expect(result.current.quote?.price).toBe(30);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('si falla, error y `onSettled(null)`; reintentar vuelve a pedir', async () => {
    mocked.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(quote(70));
    const onSettled = jest.fn();
    const { result } = renderHook(() =>
      usePriceQuote({ token: 't', patientId: 'p', catalogItemId: 'c1', currency: 'COP', onSettled }),
    );
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(onSettled).toHaveBeenCalledWith(null);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.quote?.price).toBe(70);
  });

  it.each(['', 'c2'])(
    'al volver a la misma prestación después de «%s», espera una cotización nueva',
    async (intermediate) => {
      const pending = deferred();
      mocked.mockResolvedValueOnce(quote(80)).mockReturnValue(pending.promise);
      const { result, rerender } = renderHook(
        ({ id }) => usePriceQuote({ token: 't', patientId: 'p', catalogItemId: id, currency: 'COP' }),
        { initialProps: { id: 'c1' } },
      );
      await waitFor(() => expect(result.current.status).toBe('ready'));

      rerender({ id: intermediate });
      rerender({ id: 'c1' });
      expect(result.current.status).toBe('loading');
      expect(result.current.quote).toBeNull();

      await act(async () => pending.resolve(quote(70)));
      expect(result.current.status).toBe('ready');
      expect(result.current.quote?.price).toBe(70);
    },
  );

  it('al renovar el token no muestra el precio anterior mientras consulta el nuevo contexto', async () => {
    const pending = deferred();
    mocked.mockResolvedValueOnce(quote(80)).mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(
      ({ token }) => usePriceQuote({ token, patientId: 'p', catalogItemId: 'c1', currency: 'COP' }),
      { initialProps: { token: 'old' } },
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    rerender({ token: 'new' });
    expect(result.current.status).toBe('loading');
    expect(result.current.quote).toBeNull();
    await act(async () => pending.resolve(quote(60)));
    expect(result.current.quote?.price).toBe(60);
  });
});
