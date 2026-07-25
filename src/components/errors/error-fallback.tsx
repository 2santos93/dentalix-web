import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Copy as constants (i18n-ready, es-first) — matches dashboard-view.tsx /
// agenda-view.tsx convention until next-intl wiring lands.
export const errorFallbackCopy = {
  title: 'Algo salió mal',
  description: 'Ocurrió un error inesperado. Puedes intentar de nuevo.',
  retry: 'Reintentar',
};

interface ErrorFallbackProps {
  onRetry: () => void;
}

/**
 * Presentational body for route-segment error boundaries (`error.tsx`).
 * Deliberately never renders `error.message`/`error.stack` — those can carry
 * sensitive details from a Server Component error (see Next's `error.js`
 * docs) — so the copy here is a fixed, generic Spanish message regardless of
 * what actually threw. Extracted from `(app)/error.tsx` so the fallback UI
 * itself is unit-testable outside of Next's client-boundary file convention.
 */
export function ErrorFallback({ onRetry }: ErrorFallbackProps) {
  return (
    <div role="alert" className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{errorFallbackCopy.title}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted">{errorFallbackCopy.description}</p>
          <Button type="button" onClick={onRetry} className="self-start">
            {errorFallbackCopy.retry}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
