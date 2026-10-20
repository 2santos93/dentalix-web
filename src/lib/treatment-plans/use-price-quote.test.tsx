import { act, renderHook, waitFor } from '@testing-library/react';
import { usePriceQuote } from './use-price-quote';
import { getPriceQuote, type PriceQuote } from '@/lib/patients/patient-agreement-api';

jest.mock('../patients/patient-agreement-api', () => ({ getPriceQuote: jest.fn() }));
const mocked = getPriceQuote as jest.MockedFunction<typeof getPriceQuote>;

const quote = (price: number): PriceQuote => ({
  basePrice: 100,
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
});
