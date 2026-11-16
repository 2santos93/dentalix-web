'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, FileX, Lock, Printer } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { getLabOrderPrint, labOrdersTabHref, type LabOrderPrint } from '@/lib/lab-orders/lab-orders-api';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { usePrintDocumentTitle } from '@/lib/print/use-print-document-title';
import { SectionError } from '@/components/errors/section-error';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { LabOrderDocument } from './lab-order-document';

export const labOrderPrintCopy = {
  toolbar: 'Acciones de la orden de laboratorio',
  print: 'Imprimir o guardar como PDF',
  back: 'Volver a la ficha',
  loading: 'Preparando la orden de laboratorio…',
  loadError: 'No pudimos cargar la orden de laboratorio.',
  notFoundTitle: 'No encontramos esta orden de laboratorio.',
  notFoundHint: 'Puede que el enlace no sea de esta clínica.',
  forbiddenTitle: 'Tu rol no puede imprimir órdenes de laboratorio.',
  forbiddenHint: 'La prescripción lleva datos clínicos: la imprimen odontología, asistentes y administración.',
  documentTitle: (n: number, name: string) => `Orden de laboratorio ${n} · ${name}`,
};

const copy = labOrderPrintCopy;

interface LabOrderPrintViewProps {
  token: string;
  orderId: string;
  /** En `false` no se pide nada y se muestra el aviso de acceso (la API daría 403). */
  allowed?: boolean;
}

/**
 * La orden de laboratorio lista para el papel (DX-017), fuera del shell como la
 * receta: abre el diálogo de impresión UNA vez cuando el documento está en
 * pantalla y con el formato de su sede; la barra lleva `print:hidden`.
 * Imprimirla queda en la auditoría (la API la registra al pedirla).
 */
export function LabOrderPrintView({ token, orderId, allowed = true }: LabOrderPrintViewProps) {
  const [data, setData] = useState<LabOrderPrint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deniedByApi, setDeniedByApi] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const printed = useRef(false);
  const stamp = useSedeStamp(token, [data?.order.locationId]);
  const forbidden = !allowed || deniedByApi;

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    getLabOrderPrint(token, orderId)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setDeniedByApi(err instanceof ApiError && err.status === 403);
        // 404: reintentar no lo arregla → aviso, no error con reintento.
        setNotFound(err instanceof ApiError && (err.status === 404 || err.status === 400));
        setError(apiErrorMessage(err, copy.loadError));
      });
    return () => {
      cancelled = true;
    };
  }, [token, orderId, reloadKey, allowed]);

  const formatReady = data !== null && stamp.ready && stamp.notice === null;

  useEffect(() => {
    if (formatReady && !printed.current) {
      printed.current = true;
      window.print();
    }
  }, [formatReady]);

  usePrintDocumentTitle('Orden de laboratorio', data ? copy.documentTitle(data.order.number, data.patient.fullName) : null);
  return (
    <div className="lab-order-print-page flex min-h-full flex-1 flex-col bg-surface-sunken print:min-h-0 print:bg-white">
      <div
        role="toolbar"
        aria-label={copy.toolbar}
        className="sticky top-0 z-10 flex flex-col gap-2 border-b border-border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between print:hidden"
      >
        {data ? (
          <Button asChild variant="ghost" className="justify-start">
            <Link href={labOrdersTabHref(data.order.patientId)}>
              <ChevronLeft aria-hidden />
              {copy.back}
            </Link>
          </Button>
        ) : (
          <span />
        )}
        <Button type="button" onClick={() => window.print()} disabled={!formatReady}>
          <Printer aria-hidden />
          {copy.print}
        </Button>
      </div>

      <main className="flex-1 px-0 py-0 sm:px-4 sm:py-8 print:p-0">
        {data ? (
          <div className="mx-auto flex w-full max-w-[210mm] flex-col gap-3 print:max-w-none">
            <SedeStampNote stamp={stamp} className="mx-4 sm:mx-0" />
            <div className="shadow-sm print:shadow-none">
              <LabOrderDocument data={data} stamp={stamp} />
            </div>
          </div>
        ) : forbidden ? (
          <div className="mx-auto max-w-xl px-4 py-8">
            <EmptyState role="status" icon={<Lock aria-hidden />} title={copy.forbiddenTitle} description={copy.forbiddenHint} />
          </div>
        ) : notFound ? (
          <div className="mx-auto max-w-xl px-4 py-8">
            <EmptyState role="status" icon={<FileX aria-hidden />} title={copy.notFoundTitle} description={copy.notFoundHint} />
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
