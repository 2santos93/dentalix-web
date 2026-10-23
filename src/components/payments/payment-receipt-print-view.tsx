'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Lock, Printer, ReceiptText } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import {
  printPaymentReceipt,
  receiptPrintHref,
  type PaymentReceipt,
  type ReceiptPrintFormat,
} from '@/lib/payments/payment-receipts-api';
import { PaymentReceiptDocument } from './payment-receipt-document';
import { SectionError } from '@/components/errors/section-error';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const copy = {
  toolbar: 'Acciones del recibo',
  formats: 'Formato de impresión',
  a4: 'A4',
  roll: 'Tirilla 80 mm',
  print: 'Imprimir o guardar como PDF',
  back: 'Volver a la ficha',
  loading: 'Preparando el recibo…',
  loadError: 'No pudimos cargar el recibo.',
  notFoundTitle: 'No encontramos este abono.',
  notFoundHint: 'Puede que el enlace no sea de esta clínica.',
  forbiddenTitle: 'Tu rol no tiene acceso a los recibos de caja.',
  forbiddenHint: 'Es un dato financiero: lo ven administración y recepción.',
  documentTitle: (reference: string) => `Recibo de caja ${reference}`,
};

interface PaymentReceiptPrintViewProps {
  token: string;
  paymentId: string;
  format: ReceiptPrintFormat;
  /** El rol puede ver recibos (por defecto, sí). En `false` no se pide nada. */
  allowed?: boolean;
}

/**
 * Vista imprimible del recibo de caja (DX-136), fuera del shell de la app. Lo
 * pide por la ruta de REIMPRESIÓN (la API deja cada impresión en la
 * auditoría), lo pinta en A4 o en tirilla de 80 mm y abre el diálogo de
 * impresión del navegador UNA vez (de ahí se imprime o se guarda como PDF).
 * La barra lleva `print:hidden`: no sale en el papel.
 */
export function PaymentReceiptPrintView({
  token,
  paymentId,
  format,
  allowed = true,
}: PaymentReceiptPrintViewProps) {
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deniedByApi, setDeniedByApi] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const printed = useRef(false);
  const forbidden = !allowed || deniedByApi;

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await printPaymentReceipt(token, paymentId);
        if (cancelled) return;
        setReceipt(res);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setDeniedByApi(err instanceof ApiError && err.status === 403);
        // 404: reintentar no lo arregla; va como aviso, sin reintento.
        setNotFound(err instanceof ApiError && err.status === 404);
        setError(copy.loadError);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, paymentId, reloadKey, allowed]);

  useEffect(() => {
    if (receipt && !printed.current) {
      printed.current = true;
      window.print();
    }
  }, [receipt]);

  const backHref = receipt
    ? `/patients/${encodeURIComponent(receipt.snapshot.patient.id)}?tab=treatment-plans`
    : '/patients';

  return (
    <div
      data-format={format}
      className="receipt-print-page flex min-h-full flex-1 flex-col bg-surface-2 print:bg-white"
    >
      {receipt ? <title>{copy.documentTitle(receipt.reference)}</title> : null}
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
          <nav aria-label={copy.formats} className="flex gap-1 rounded-md border border-border p-1">
            {(['a4', '80mm'] as const).map((f) => (
              <Link
                key={f}
                href={receiptPrintHref(paymentId, f)}
                aria-current={f === format ? 'page' : undefined}
                className={cn(
                  'flex min-h-9 flex-1 items-center justify-center whitespace-nowrap rounded-sm px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  f === format ? 'bg-primary/10 text-primary' : 'text-muted hover:bg-surface-2',
                )}
              >
                {f === 'a4' ? copy.a4 : copy.roll}
              </Link>
            ))}
          </nav>
          <Button type="button" onClick={() => window.print()} disabled={!receipt}>
            <Printer aria-hidden />
            {copy.print}
          </Button>
        </div>
      </div>

      <main className="flex-1 px-0 py-0 sm:px-4 sm:py-8 print:p-0">
        {receipt ? (
          <div
            className={cn(
              'mx-auto shadow-sm print:shadow-none',
              format === '80mm' ? 'max-w-[80mm]' : 'max-w-[210mm]',
            )}
          >
            <PaymentReceiptDocument receipt={receipt} format={format} />
          </div>
        ) : forbidden ? (
          <div className="mx-auto max-w-xl px-4 py-8">
            <EmptyState
              role="status"
              icon={<Lock aria-hidden />}
              title={copy.forbiddenTitle}
              description={copy.forbiddenHint}
            />
          </div>
        ) : notFound ? (
          <div className="mx-auto max-w-xl px-4 py-8">
            <EmptyState
              role="status"
              icon={<ReceiptText aria-hidden />}
              title={copy.notFoundTitle}
              description={copy.notFoundHint}
            />
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
