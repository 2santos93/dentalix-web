import type * as React from 'react';

/**
 * One callback ref that feeds several refs: the caller's (forwarded) and the
 * primitive's own (to set `indeterminate`, measure a textarea…).
 */
export function composeRefs<T>(...refs: (React.Ref<T> | undefined)[]): React.RefCallback<T> {
  return (node) => {
    for (const ref of refs) {
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as React.RefObject<T | null>).current = node;
    }
  };
}

/** Joins `aria-describedby` ids, dropping the empty ones. */
export function describedBy(...ids: (string | null | undefined | false)[]): string | undefined {
  const joined = ids.filter(Boolean).join(' ');
  return joined || undefined;
}
