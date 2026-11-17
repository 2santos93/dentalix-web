'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, FileX, Printer } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  commissionSettlementHref,
  getCommissionSettlement,
  type CommissionSettlement,
} from '@/lib/commissions/commissions-api';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { usePrintDocumentTitle } from '@/lib/print/use-print-document-title';
import { useClinicBranding } from '@/components/brand/branding-context';
import { SectionError } from '@/components/errors/section-error';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { CommissionSettlementDocument } from './commission-settlement-document';

export const commissionPrintCopy = {
  toolbar: 'Acciones de la liquidación',
  print: 'Imprimir o guardar como PDF',
  back: 'Volver a la liquidación',
  loading: 'Preparando la liquidación…',
  loadError: 'No pudimos cargar la liquidación.',
  notFoundTitle: 'No encontramos esta liquidación.',
  notFoundHint: 'Puede que no sea tuya o que el enlace no sea de esta clínica.',
  documentTitle: (name: string, from: string) => `Liquidación de honorarios · ${name} · ${from}`,
};

const copy = commissionPrintCopy;

/**
 * La liquidación de honorarios lista para el papel (DX-018), fuera del shell
 * como la orden de laboratorio: abre el diálogo de impresión UNA vez cuando el
 * documento está en pantalla con el formato de la sede; la barra lleva
 * `print:hidden`.
 */
export function CommissionSettlementPrintView({ token, id }: { token: string; id: string }) {
  const [data, setData] = useState<CommissionSettlement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const printed = useRef(false);
  const branding = useClinicBranding();
  const stamp = useSedeStamp(token, data?.lines.map((l) => l.locationId) ?? []);

  useEffect(() => {
    let cancelled = false;
    getCommissionSettlement(token, id)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setNotFound(err instanceof ApiError && (err.status === 404 || err.status === 400));
        setError(apiErrorMessage(err, copy.loadError));
      });
    return () => {
      cancelled = true;
    };
  }, [token, id, reloadKey]);

  const formatReady = data !== null && stamp.ready && stamp.notice === null;

  useEffect(() => {
    if (formatReady && !printed.current) {
      printed.current = true;
      window.print();
    }
  }, [formatReady]);

  usePrintDocumentTitle('Liquidación de honorarios', data ? copy.documentTitle(data.professional.name, data.period.from) : null);

  return (
    <div className="commission-print-page flex min-h-full flex-1 flex-col bg-surface-sunken print:min-h-0 print:bg-white">
      <div
        role="toolbar"
        aria-label={copy.toolbar}
        className="sticky top-0 z-10 flex flex-col gap-2 border-b border-border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between print:hidden"
      >
        <Button asChild variant="ghost" className="justify-start">
          <Link href={commissionSettlementHref(id)}>
            <ChevronLeft aria-hidden />
            {copy.back}
          </Link>
        </Button>
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
              <CommissionSettlementDocument data={data} stamp={stamp} clinic={branding} />
            </div>
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
