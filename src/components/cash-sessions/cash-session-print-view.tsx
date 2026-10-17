'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Lock, Printer, Wallet } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import {
  cashSessionHref,
  getCashSession,
  type CashSessionDetail,
} from '@/lib/cash-sessions/cash-sessions-api';
import { formatCivilDate } from '@/lib/format/date';
import { SectionError } from '@/components/errors/section-error';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { CashSessionReport } from './cash-session-report';

const copy = {
  toolbar: 'Acciones del informe',
  print: 'Imprimir o guardar como PDF',
  back: 'Volver al turno',
  loading: 'Preparando el informe…',
  loadError: 'No pudimos cargar el informe.',
  notFoundTitle: 'No encontramos este turno.',
  notFoundHint: 'Puede que sea de otra persona o de otra clínica.',
  forbiddenTitle: 'Tu rol no tiene acceso a la caja.',
  forbiddenHint: 'Es un dato financiero: lo ven administración y recepción.',
  documentTitle: (sede: string, day: string) => `Cierre de caja ${sede} ${day}`,
};

interface CashSessionPrintViewProps {
  token: string;
  sessionId: string;
  /** El rol puede ver la caja (por defecto, sí). En `false` no se pide nada. */
  allowed?: boolean;
}

/**
 * Informe de cierre de caja imprimible (DX-027), fuera del shell de la app,
 * en A4: el navegador lo imprime o lo guarda como PDF (la API no genera PDF).
 * Abre el diálogo de impresión UNA vez al cargar. La barra lleva
 * `print:hidden`: no sale en el papel.
 */
export function CashSessionPrintView({ token, sessionId, allowed = true }: CashSessionPrintViewProps) {
  const [session, setSession] = useState<CashSessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const printed = useRef(false);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    getCashSession(token, sessionId)
      .then((res) => {
        if (cancelled) return;
        setSession(res);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus(err instanceof ApiError ? err.status : null);
        setError(copy.loadError);
      });
    return () => {
      cancelled = true;
    };
  }, [token, sessionId, reloadKey, allowed]);

  useEffect(() => {
    if (session && !printed.current) {
      printed.current = true;
      window.print();
    }
  }, [session]);

  const forbidden = !allowed || status === 403;

  return (
    <div className="cash-report-print-page flex min-h-full flex-1 flex-col bg-surface-2 print:bg-white">
      {session ? (
        <title>
          {copy.documentTitle(
            session.location.name,
            formatCivilDate(session.closing?.suggestedLockDate ?? session.openedOn),
          )}
        </title>
      ) : null}
      <div
        role="toolbar"
        aria-label={copy.toolbar}
        className="sticky top-0 z-10 flex flex-col gap-2 border-b border-border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between print:hidden"
      >
        <Button asChild variant="ghost" className="justify-start">
          <Link href={cashSessionHref(sessionId)}>
            <ChevronLeft aria-hidden />
            {copy.back}
          </Link>
        </Button>
        <Button type="button" onClick={() => window.print()} disabled={!session}>
          <Printer aria-hidden />
          {copy.print}
        </Button>
      </div>

      <main className="flex-1 px-0 py-0 sm:px-4 sm:py-8 print:p-0">
        {session ? (
          <div className="mx-auto max-w-[210mm] shadow-sm print:shadow-none">
            <CashSessionReport session={session} linkSessions={false} />
          </div>
        ) : forbidden ? (
          <div className="mx-auto max-w-xl px-4 py-8">
            <EmptyState role="status" icon={<Lock aria-hidden />} title={copy.forbiddenTitle} description={copy.forbiddenHint} />
          </div>
        ) : status === 404 ? (
          <div className="mx-auto max-w-xl px-4 py-8">
            <EmptyState role="status" icon={<Wallet aria-hidden />} title={copy.notFoundTitle} description={copy.notFoundHint} />
          </div>
        ) : error ? (
          <div className="mx-auto max-w-xl px-4 py-8">
            <SectionError
              description={error}
              onRetry={() => {
                setError(null);
                setReloadKey((k) => k + 1);
              }}
            />
          </div>
        ) : (
          <p role="status" className="px-4 py-8 text-center text-sm text-muted">
            {copy.loading}
          </p>
        )}
      </main>
    </div>
  );
}
