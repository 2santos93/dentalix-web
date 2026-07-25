'use client'; // Error boundaries must be Client Components (Next's error.js convention).

import { useEffect } from 'react';
import { ErrorFallback } from '@/components/errors/error-fallback';

/**
 * Route-segment error boundary for the authenticated `(app)` group — per
 * Next's `error.js` file convention it wraps every page/layout nested under
 * `(app)` (dashboard, agenda, patients, staff, …) in a React error boundary,
 * so an uncaught render-time exception anywhere in that segment (e.g. an
 * invalid currency code reaching `Intl.NumberFormat` and throwing a
 * `RangeError`) shows this fallback instead of a blank/broken page.
 *
 * `error.message`/`.stack` are intentionally never rendered: per the docs,
 * Server Component errors are already scrubbed to a generic message + digest
 * in production, but Client Component errors still carry the original
 * message end-to-end — so this file must not surface it itself. Only
 * `console.error` logs the real error (dev tooling / error reporting), and
 * the visible UI is the fixed, generic `ErrorFallback` copy.
 */
export default function AppSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service.
    console.error(error);
  }, [error]);

  return <ErrorFallback onRetry={reset} />;
}
