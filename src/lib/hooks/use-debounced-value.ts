'use client';
import { useEffect, useState } from 'react';

/**
 * Returns `value`, delayed until it has stopped changing for `delayMs` — the
 * hook version of a debounce, for driving server calls off a fast-changing
 * input (e.g. a search box) without an ad-hoc setTimeout/clearTimeout pair
 * living inside the component. The first render returns `value` immediately
 * (no artificial initial delay).
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
