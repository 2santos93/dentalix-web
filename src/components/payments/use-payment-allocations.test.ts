import { act, renderHook, waitFor } from '@testing-library/react';
import { ApiError } from '@/lib/api/client';
import {
  getPaymentAllocations,
  replacePaymentAllocations,
  type PaymentAllocations,
} from '@/lib/payments/payment-allocations-api';
import { usePaymentAllocations } from './use-payment-allocations';

jest.mock('../../lib/payments/payment-allocations-api', () => ({
  getPaymentAllocations: jest.fn(),
  replacePaymentAllocations: jest.fn(),
}));

const mockedGet = jest.mocked(getPaymentAllocations);
const mockedPut = jest.mocked(replacePaymentAllocations);

const DATA: PaymentAllocations = {
  paymentId: 'pay-1',
  receiptNumber: 'NOR-000123',
  treatmentPlanId: 'plan-1',
  paymentAmount: 120,
  paymentCurrency: 'USD',
  paidOn: '2026-10-20',
  planCurrency: 'USD',
  planStatus: 'ACCEPTED',
  planAmount: 120,
  manual: false,
  allocated: 0,
  unallocated: 120,
  version: 'a'.repeat(64),
  allocations: [],
  items: [],
};

describe('usePaymentAllocations (DX-051)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('loads the allocation of the payment', async () => {
    mockedGet.mockResolvedValue(DATA);
    const { result } = renderHook(() => usePaymentAllocations('tok', 'pay-1'));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockedGet).toHaveBeenCalledWith('tok', 'pay-1');
    expect(result.current.data).toEqual(DATA);
    expect(result.current.error).toBeNull();
  });

  it('a failed load says why in Spanish and reload retries', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError(404, 'Abono no encontrado.'));
    const { result } = renderHook(() => usePaymentAllocations('tok', 'pay-1'));
    await waitFor(() => expect(result.current.error).toBe('Abono no encontrado.'));
    expect(result.current.data).toBeNull();

    mockedGet.mockResolvedValueOnce(DATA);
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.data).toEqual(DATA));
    expect(result.current.error).toBeNull();
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('a technical load error falls back to the screen copy', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError(500, 'Internal server error'));
    const { result } = renderHook(() => usePaymentAllocations('tok', 'pay-1'));
    await waitFor(() => expect(result.current.error).toBe('No pudimos cargar la imputación del abono.'));
  });

  it('save sends the body and reports success', async () => {
    mockedGet.mockResolvedValue(DATA);
    mockedPut.mockResolvedValue({ ...DATA, manual: true, previous: [] });
    const { result } = renderHook(() => usePaymentAllocations('tok', 'pay-1'));
    await waitFor(() => expect(result.current.data).not.toBeNull());

    const body = { expectedVersion: DATA.version, mode: 'MANUAL' as const, allocations: [] };
    let ok = false;
    await act(async () => {
      ok = await result.current.save(body);
    });
    expect(ok).toBe(true);
    expect(mockedPut).toHaveBeenCalledWith('tok', 'pay-1', body);
    expect(result.current.saving).toBe(false);
    expect(result.current.saveError).toBeNull();
  });

  it('a 409 on save is stale: the server message plus a reload way out', async () => {
    mockedGet.mockResolvedValue(DATA);
    const message =
      'La imputación de este abono cambió mientras la editabas. Revisa los importes y vuelve a guardar.';
    mockedPut.mockRejectedValue(new ApiError(409, message));
    const { result } = renderHook(() => usePaymentAllocations('tok', 'pay-1'));
    await waitFor(() => expect(result.current.data).not.toBeNull());

    let ok = true;
    await act(async () => {
      ok = await result.current.save({ expectedVersion: DATA.version, mode: 'AUTO' });
    });
    expect(ok).toBe(false);
    expect(result.current.saveError).toEqual({ message, stale: true });

    // Volver a cargar con otra versión: el error ya no aplica.
    mockedGet.mockResolvedValueOnce({ ...DATA, version: 'c'.repeat(64) });
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.data?.version).toBe('c'.repeat(64)));
    expect(result.current.saveError).toBeNull();
  });

  it('a reload that brings the same allocation keeps the explanation, without reload', async () => {
    mockedGet.mockResolvedValue(DATA);
    const message = 'Este abono es de un saldo migrado: no se imputa a ítems de un plan.';
    mockedPut.mockRejectedValue(new ApiError(409, message));
    const { result } = renderHook(() => usePaymentAllocations('tok', 'pay-1'));
    await waitFor(() => expect(result.current.data).not.toBeNull());
    await act(async () => {
      await result.current.save({ expectedVersion: DATA.version, mode: 'AUTO' });
    });

    act(() => result.current.reload());
    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.saveError).toEqual({ message, stale: false });
  });

  it('a 400 on save keeps the server message (one-element validation list) and is not stale', async () => {
    mockedGet.mockResolvedValue(DATA);
    const message = 'Un ítem admite como máximo 70.00 USD: es lo que le queda por cubrir.';
    mockedPut.mockRejectedValue(new ApiError(400, 'Bad Request', { messages: [message] }));
    const { result } = renderHook(() => usePaymentAllocations('tok', 'pay-1'));
    await waitFor(() => expect(result.current.data).not.toBeNull());

    await act(async () => {
      await result.current.save({ expectedVersion: DATA.version, mode: 'MANUAL', allocations: [] });
    });
    expect(result.current.saveError).toEqual({ message, stale: false });
  });

  it('a 403 on save says only an administrator reallocates', async () => {
    mockedGet.mockResolvedValue(DATA);
    mockedPut.mockRejectedValue(new ApiError(403, 'Insufficient role'));
    const { result } = renderHook(() => usePaymentAllocations('tok', 'pay-1'));
    await waitFor(() => expect(result.current.data).not.toBeNull());

    await act(async () => {
      await result.current.save({ expectedVersion: DATA.version, mode: 'AUTO' });
    });
    expect(result.current.saveError?.message).toBe(
      'Solo un administrador cambia la imputación de un abono.',
    );
  });
});
