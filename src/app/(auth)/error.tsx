'use client';

import { useEffect } from 'react';
import { ErrorFallback } from '@/components/errors/error-fallback';
import { reportBoundaryError } from '@/components/errors/report-boundary-error';

/**
 * DX-116: login, registro, restablecer e invitación. Sin esto, un fallo de render
 * enseñaba la pantalla de Next en inglés y sin salida. Texto fijo: nunca el
 * mensaje del error (ver `(app)/error.tsx`).
 */
export default function AuthError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    reportBoundaryError(error);
  }, [error]);
  return (
    <main className="flex min-h-dvh flex-col bg-canvas">
      <ErrorFallback onRetry={retry} />
    </main>
  );
}
