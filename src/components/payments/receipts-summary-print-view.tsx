'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { CalendarX, ChevronLeft, Lock, Printer, UserX } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { printReceiptsSummary, type ReceiptsSummary } from '@/lib/payments/receipts-summary-api';
import { summaryRangeError } from '@/lib/payments/receipts-summary-range';
import { readyClock, useSedeClock } from '@/lib/locations/sede-clock';
import { DocumentFormatNote } from '@/components/documents/document-format-note';
import { SectionError } from '@/components/errors/section-error';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { usePrintDocumentTitle } from '@/lib/print/use-print-document-title';
import { ReceiptsSummaryDocument } from './receipts-summary-document';

const copy = {
  toolbar: 'Acciones del documento',
  print: 'Imprimir o guardar como PDF',
  back: 'Volver a la ficha',
  loading: 'Preparando el resumen de recibos…',
  loadError: 'No pudimos cargar el resumen de recibos.',
  badRangeTitle: 'El periodo del enlace no es válido.',
  notFoundTitle: 'No encontramos este paciente.',
  notFoundHint: 'Puede que se haya retirado o que el enlace no sea de esta clínica.',
  forbiddenTitle: 'Tu rol no tiene acceso a los recibos de caja.',
  forbiddenHint: 'Es un dato financiero: lo ven administración y recepción.',
  genericTitle: 'Resumen de recibos',
  documentTitle: (name: string) => `Resumen de recibos · ${name}`,
};

interface ReceiptsSummaryPrintViewProps {
  token: string;
  patientId: string;
  from: string | null;
  to: string | null;
  /** El rol puede ver recibos (por defecto, sí). En `false` no se pide nada. */
  allowed?: boolean;
}

/**
 * Vista imprimible del recibo resumen (DX-401), fuera del shell de la app.
 * Lo pide por la ruta de IMPRESIÓN (la API deja cada impresión en la
 * auditoría), lo pinta con el formato de la sede de la pantalla y abre el
 * diálogo de impresión del navegador UNA vez. La barra lleva `print:hidden`.
 */
export function ReceiptsSummaryPrintView({ token, patientId, from, to, allowed = true }: ReceiptsSummaryPrintViewProps) {
  const [data, setData] = useState<ReceiptsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deniedByApi, setDeniedByApi] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const printed = useRef(false);
  const clockState = useSedeClock(token);
  // El resumen no trae sede propia: fechas e importes con la zona y el formato de la sede de la pantalla.
  const clock = readyClock(clockState);
  const format = clock ? { fmt: clock.fmt, timeZone: clock.timeZone } : null;
  const rangeError = summaryRangeError(from, to);
  const forbidden = !allowed || deniedByApi;

  useEffect(() => {
    if (!allowed || rangeError || !from || !to) return;
    let cancelled = false;
    printReceiptsSummary(token, patientId, { from, to })
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setDeniedByApi(err instanceof ApiError && err.status === 403);
        // 404: reintentar no lo arregla; va como aviso, sin reintento.
        setNotFound(err instanceof ApiError && err.status === 404);
        setError(apiErrorMessage(err, { fallback: copy.loadError }));
      });
    return () => {
      cancelled = true;
    };
    // `rangeError` sale de `from`/`to`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, patientId, from, to, reloadKey, allowed]);

  const ready = data !== null && clock !== null;
  useEffect(() => {
    if (ready && !printed.current) {
      printed.current = true;
      window.print();
    }
  }, [ready]);

  const backHref = `/patients/${encodeURIComponent(patientId)}?tab=account-statement`;
  usePrintDocumentTitle(copy.genericTitle, data ? copy.documentTitle(data.patient.fullName) : null);

  return (
    <div className="statement-print-page flex min-h-full flex-1 flex-col bg-surface-sunken print:min-h-0 print:bg-white">
      <div
        role="toolbar"
        aria-label={copy.toolbar}
        className="sticky top-0 z-10 flex flex-col gap-2 border-b border-border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between print:hidden"
      >
        <Button asChild variant="ghost" className="justify-start">
          <Link href={backHref}>
            <ChevronLeft aria-hidden />
            {copy.back}
          </Link>
        </Button>
        <Button type="button" onClick={() => window.print()} disabled={!ready}>
          <Printer aria-hidden />
          {copy.print}
        </Button>
      </div>

      <main className="min-w-0 flex-1 px-0 py-0 sm:px-4 sm:py-8 print:p-0">
        {forbidden ? (
          <Notice icon={<Lock aria-hidden />} title={copy.forbiddenTitle} description={copy.forbiddenHint} />
        ) : rangeError ? (
          <Notice icon={<CalendarX aria-hidden />} title={copy.badRangeTitle} description={rangeError.message} />
        ) : data ? (
          <>
            <DocumentFormatNote
              onRetry={clockState.status === 'error' ? clockState.retry : () => setReloadKey((k) => k + 1)}
              className="mx-auto max-w-[210mm] px-4 pb-4 sm:px-0"
              active={clockState.status === 'error'}
            />
            <div className="mx-auto max-w-[210mm] sm:border sm:border-border print:border-0">
              <ReceiptsSummaryDocument summary={data} format={format} />
            </div>
          </>
        ) : notFound ? (
          <Notice icon={<UserX aria-hidden />} title={copy.notFoundTitle} description={copy.notFoundHint} />
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

function Notice({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <EmptyState role="status" icon={icon} title={title} description={description} />
    </div>
  );
}
