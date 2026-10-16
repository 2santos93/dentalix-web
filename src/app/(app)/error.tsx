'use client'; // Error boundaries must be Client Components (Next's error.js convention).

import { useEffect } from 'react';
import { ErrorFallback } from '@/components/errors/error-fallback';
import { reportBoundaryError } from '@/components/errors/report-boundary-error';

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
 * message end-to-end — so this file must not surface it itself. The error is
 * logged through `reportBoundaryError` (only `name`/`digest` in production, the
 * full error in dev — DX-061), and the visible UI is the fixed, generic
 * `ErrorFallback` copy.
 */
export default function AppSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportBoundaryError(error);
  }, [error]);

  return <ErrorFallback onRetry={reset} />;
}
