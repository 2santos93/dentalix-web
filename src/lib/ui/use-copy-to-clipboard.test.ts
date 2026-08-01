import { renderHook, act } from '@testing-library/react';
import { useCopyToClipboard } from './use-copy-to-clipboard';

const writeText = jest.fn().mockResolvedValue(undefined);
beforeAll(() => {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});
beforeEach(() => writeText.mockClear());

it('copia el texto y marca copiado, y luego se resetea', async () => {
  jest.useFakeTimers();
  const { result } = renderHook(() => useCopyToClipboard());
  expect(result.current.copied).toBe(false);

  await act(async () => {
    await result.current.copy('https://clinica.dentalix.app/invitacion/abc');
  });
  expect(writeText).toHaveBeenCalledWith('https://clinica.dentalix.app/invitacion/abc');
  expect(result.current.copied).toBe(true);

  act(() => {
    jest.advanceTimersByTime(2500);
  });
  expect(result.current.copied).toBe(false);
  jest.useRealTimers();
});
