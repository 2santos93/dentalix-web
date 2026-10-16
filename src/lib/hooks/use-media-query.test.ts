import { act, renderHook } from '@testing-library/react';
import { useMediaQuery } from './use-media-query';

describe('useMediaQuery', () => {
  const original = window.matchMedia;
  afterEach(() => {
    window.matchMedia = original;
  });

  it('sin matchMedia (jsdom) es false', () => {
    const { result } = renderHook(() => useMediaQuery('(min-width: 1400px)'));
    expect(result.current).toBe(false);
  });

  it('sigue a la media query cuando cambia', () => {
    let matches = true;
    const listeners = new Set<() => void>();
    window.matchMedia = ((query: string) => ({
      media: query,
      get matches() {
        return matches;
      },
      addEventListener: (_: string, l: () => void) => listeners.add(l),
      removeEventListener: (_: string, l: () => void) => listeners.delete(l),
    })) as unknown as typeof window.matchMedia;
    const { result } = renderHook(() => useMediaQuery('(min-width: 1400px)'));
    expect(result.current).toBe(true);
    act(() => {
      matches = false;
      listeners.forEach((l) => l());
    });
    expect(result.current).toBe(false);
  });
});
