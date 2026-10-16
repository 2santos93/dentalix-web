"use client"; // Error boundaries must be Client Components (Next's error.js convention).

import { useEffect } from "react";
import { ErrorFallback } from "@/components/errors/error-fallback";
import { reportBoundaryError } from "@/components/errors/report-boundary-error";

/**
 * Límite de error de las vistas imprimibles (`/print/...`). Viven fuera del
 * grupo `(app)`, así que su `error.tsx` no las cubre: sin este archivo, un
 * fallo de render (p. ej. una moneda inválida en `Intl.NumberFormat`) dejaría
 * la pestaña de impresión en blanco. Mismo criterio que `(app)/error.tsx`:
 * nunca se pinta `error.message`, y en producción solo se registran
 * `name`/`digest` (`reportBoundaryError`, DX-061).
 */
export default function PrintSegmentError({
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
