'use client';

import { useEffect } from 'react';
import { ErrorFallback } from '@/components/errors/error-fallback';
import { reportBoundaryError } from '@/components/errors/report-boundary-error';

/** DX-116: el panel de la plataforma, con el mismo fallback que la app. */
export default function AdminError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    reportBoundaryError(error);
  }, [error]);
  return (
    <main className="flex min-h-dvh flex-col bg-canvas">
      <ErrorFallback onRetry={retry} />
    </main>
  );
}
