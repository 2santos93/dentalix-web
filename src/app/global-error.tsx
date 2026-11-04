'use client';

import { useEffect } from 'react';
import { errorFallbackCopy } from '@/components/errors/error-fallback';
import { reportBoundaryError } from '@/components/errors/report-boundary-error';

// Sustituye al layout raíz: si este falló, puede que no haya ni estilos ni tema.
// Por eso los estilos van en línea y siguen la preferencia del sistema.
const STYLES = `
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100dvh; display: flex; align-items: center; justify-content: center; padding: 24px;
    box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; background: Canvas; color: CanvasText; }
  main { max-width: 24rem; }
  h1 { margin: 0 0 8px; font-size: 1.25rem; }
  p { margin: 0 0 16px; font-size: 0.875rem; line-height: 1.5; }
  button { min-height: 44px; padding: 0 16px; font: inherit; font-weight: 600; cursor: pointer; }
`;

/** DX-116: último recurso, cuando falla el propio layout raíz. */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    reportBoundaryError(error);
  }, [error]);
  return (
    <html lang="es">
      <head>
        <title>{errorFallbackCopy.title}</title>
        <style>{STYLES}</style>
      </head>
      <body>
        <main role="alert">
          <h1>{errorFallbackCopy.title}</h1>
          <p>{errorFallbackCopy.description}</p>
          <button type="button" onClick={retry}>
            {errorFallbackCopy.retry}
          </button>
        </main>
      </body>
    </html>
  );
}
