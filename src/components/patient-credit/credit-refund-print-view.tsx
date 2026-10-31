'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Lock, Printer, ReceiptText } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import {
  getCreditRefund,
  refundPrintHref,
  type CreditRefund,
  type RefundPrintFormat,
} from '@/lib/patient-credit/patient-credit-api';
import { SectionError } from '@/components/errors/section-error';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CreditRefundDocument } from './credit-refund-document';

const copy = {
  toolbar: 'Acciones del comprobante',
  formats: 'Formato de impresión',
  a4: 'A4',
  roll: 'Tirilla 80 mm',
  print: 'Imprimir o guardar como PDF',
  back: 'Volver a la ficha',
  loading: 'Preparando el comprobante…',
  loadError: 'No pudimos cargar el comprobante.',
  notFoundTitle: 'No encontramos esta devolución.',
  notFoundHint: 'Puede que el enlace no sea de esta clínica.',
  forbiddenTitle: 'Tu rol no tiene acceso a las devoluciones.',
  forbiddenHint: 'Es un dato financiero: lo ven administración y recepción.',
  documentTitle: (n: string) => `Comprobante de devolución ${n}`,
};

/**
 * Vista imprimible del comprobante de devolución (DX-253), fuera del shell:
 * A4 o tirilla de 80 mm; abre el diálogo de impresión UNA vez. La barra va con
 * `print:hidden`.
 */
export function CreditRefundPrintView({
  token,
  refundId,
  format,
  allowed = true,
}: {
  token: string;
  refundId: string;
  format: RefundPrintFormat;
  allowed?: boolean;
}) {
  const [refund, setRefund] = useState<CreditRefund | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deniedByApi, setDeniedByApi] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const printed = useRef(false);
  const forbidden = !allowed || deniedByApi;

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    getCreditRefund(token, refundId)
      .then((res) => {
        if (cancelled) return;
        setRefund(res);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setDeniedByApi(err instanceof ApiError && err.status === 403);
        setNotFound(err instanceof ApiError && err.status === 404);
        setError(copy.loadError);
      });
    return () => {
      cancelled = true;
    };
  }, [token, refundId, reloadKey, allowed]);

  useEffect(() => {
    if (refund && !printed.current) {
      printed.current = true;
      window.print();
    }
  }, [refund]);

  const backHref = refund
    ? `/patients/${encodeURIComponent(refund.patientId)}?tab=account-statement`
    : '/patients';

  return (
    <div data-format={format} className="receipt-print-page flex min-h-full flex-1 flex-col bg-surface-sunken print:bg-white">
      {refund ? <title>{copy.documentTitle(refund.number)}</title> : null}
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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {/* Formato con el aspecto de SegmentedControl (pista hundida, elegido en
              superficie y tinta): son enlaces porque cada formato es una URL. */}
          <nav aria-label={copy.formats} className="flex gap-0.5 rounded-lg border border-border bg-surface-sunken p-0.5">
            {(['a4', '80mm'] as const).map((f) => (
              <Link
                key={f}
                href={refundPrintHref(refundId, f)}
                aria-current={f === format ? 'page' : undefined}
                className={cn(
                  'focus-ring flex min-h-11 flex-1 items-center justify-center whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors sm:min-h-9',
                  f === format ? 'bg-surface text-ink shadow-lift' : 'text-muted hover:bg-surface-active hover:text-ink',
                )}
              >
                {f === 'a4' ? copy.a4 : copy.roll}
              </Link>
            ))}
          </nav>
          <Button type="button" onClick={() => window.print()} disabled={!refund}>
            <Printer aria-hidden />
            {copy.print}
          </Button>
        </div>
      </div>
      <main className="flex-1 px-0 py-0 sm:px-4 sm:py-8 print:p-0">
        {refund ? (
          <div className={cn('mx-auto shadow-sm print:shadow-none', format === '80mm' ? 'max-w-[80mm]' : 'max-w-[210mm]')}>
            <CreditRefundDocument refund={refund} format={format} />
          </div>
        ) : forbidden ? (
          <div className="mx-auto max-w-xl px-4 py-8">
            <EmptyState role="status" icon={<Lock aria-hidden />} title={copy.forbiddenTitle} description={copy.forbiddenHint} />
          </div>
        ) : notFound ? (
          <div className="mx-auto max-w-xl px-4 py-8">
            <EmptyState role="status" icon={<ReceiptText aria-hidden />} title={copy.notFoundTitle} description={copy.notFoundHint} />
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
