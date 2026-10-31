import { act, renderHook } from '@testing-library/react';
import { useSubdomainAvailability } from './use-subdomain-availability';
import { checkSubdomainAvailability } from './register-api';

jest.mock('./register-api', () => ({
  ...jest.requireActual('./register-api'),
  checkSubdomainAvailability: jest.fn(),
}));

const mockedCheck = jest.mocked(checkSubdomainAvailability);

beforeEach(() => {
  jest.useFakeTimers();
  mockedCheck.mockReset();
});
afterEach(() => jest.useRealTimers());

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

it('no dice nada mientras se escribe; pregunta una vez al parar', async () => {
  mockedCheck.mockResolvedValue('available');
  const { result, rerender } = renderHook(({ v }) => useSubdomainAvailability(v, 500), {
    initialProps: { v: 's' },
  });
  rerender({ v: 'so' });
  rerender({ v: 'Sonrisa ' });
  expect(result.current).toBe('idle');
  await act(async () => {
    jest.advanceTimersByTime(500);
  });
  expect(mockedCheck).toHaveBeenCalledTimes(1);
  expect(mockedCheck).toHaveBeenCalledWith('sonrisa');
  expect(result.current).toBe('available');
});

it('una respuesta vieja que llega tarde no pisa la de la dirección actual', async () => {
  const slow = deferred<'taken'>();
  const fast = deferred<'available'>();
  mockedCheck.mockImplementation((slug) => (slug === 'uno' ? slow.promise : fast.promise));
  const { result, rerender } = renderHook(({ v }) => useSubdomainAvailability(v, 500), {
    initialProps: { v: 'uno' },
  });
  await act(async () => {
    jest.advanceTimersByTime(500);
  });
  expect(result.current).toBe('checking');
  rerender({ v: 'unos' });
  expect(result.current).toBe('idle');
  await act(async () => {
    jest.advanceTimersByTime(500);
    fast.resolve('available');
  });
  await act(async () => {
    slow.resolve('taken');
  });
  expect(result.current).toBe('available');
});

it('formato inválido sin petición; vacía = idle; error de red = unknown', async () => {
  mockedCheck.mockRejectedValue(new Error('red'));
  const { result, rerender } = renderHook(({ v }) => useSubdomainAvailability(v, 500), {
    initialProps: { v: '-mal' },
  });
  await act(async () => {
    jest.advanceTimersByTime(500);
  });
  expect(result.current).toBe('invalid');
  expect(mockedCheck).not.toHaveBeenCalled();

  rerender({ v: '' });
  expect(result.current).toBe('idle');

  rerender({ v: 'bien' });
  await act(async () => {
    jest.advanceTimersByTime(500);
  });
  expect(result.current).toBe('unknown');
});
