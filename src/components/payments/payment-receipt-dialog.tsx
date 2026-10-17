'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Lock, Mail, Printer, ReceiptText } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  getPaymentReceipt,
  receiptPrintHref,
  sendPaymentReceipt,
  type PaymentReceipt,
} from '@/lib/payments/payment-receipts-api';
import { PaymentReceiptDocument } from './payment-receipt-document';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { SectionError } from '@/components/errors/section-error';
import { notifyError } from '@/components/errors/notify';

const copy = {
  title: 'Recibo de caja',
  description: 'El recibo del abono tal como se emitió: se imprime o se envía igual.',
  loading: 'Cargando el recibo…',
  loadError: 'No pudimos cargar el recibo.',
  forbiddenTitle: 'Tu rol no tiene acceso a los recibos de caja.',
  forbiddenHint: 'Es un dato financiero: lo ven administración y recepción.',
  close: 'Cerrar',
  printA4: 'Imprimir A4',
  printRoll: 'Tirilla 80 mm',
  newTab: '(se abre en otra pestaña)',
  send: 'Enviar por email',
  sending: 'Enviando…',
  sent: (to: string) => `Recibo enviado a ${to}.`,
  sendError: 'No pudimos enviar el recibo.',
};

interface PaymentReceiptDialogProps {
  token: string;
  /** El abono del recibo, o `null` para tener el diálogo cerrado. */
  paymentId: string | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Recibo de caja de un abono en un diálogo (DX-136): lo carga de la API (la
 * foto inmutable del recibo, con su número de serie o «sin serie», y la marca
 * de ANULADO), lo muestra como documento y ofrece imprimirlo en A4 o en
 * tirilla de 80 mm (vista imprimible en otra pestaña) o enviarlo por email al
 * paciente. `paymentId` hace a la vez de bandera de apertura y de qué abono.
 */
export function PaymentReceiptDialog({ token, paymentId, onOpenChange }: PaymentReceiptDialogProps) {
  return (
    <Dialog open={paymentId !== null} onOpenChange={onOpenChange}>
      {paymentId !== null ? (
        <DialogContent className="max-w-3xl gap-3 p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>{copy.description}</DialogDescription>
          </DialogHeader>
          <ReceiptBody token={token} paymentId={paymentId} onClose={() => onOpenChange(false)} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function ReceiptBody({
  token,
  paymentId,
  onClose,
}: {
  token: string;
  paymentId: string;
  onClose: () => void;
}) {
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPaymentReceipt(token, paymentId)
      .then((res) => {
        if (cancelled) return;
        setReceipt(res);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setForbidden(err instanceof ApiError && err.status === 403);
        setError(apiErrorMessage(err, { fallback: copy.loadError }));
      });
    return () => {
      cancelled = true;
    };
  }, [token, paymentId, reloadKey]);

  async function send() {
    setSending(true);
    try {
      const { sentTo } = await sendPaymentReceipt(token, paymentId);
      toast.success(copy.sent(sentTo));
    } catch (err) {
      // Escalón 3: el recibo sigue en pantalla y correcto; el aviso trae
      // reintento (cierra sobre el propio abono, que es lo que se reintenta).
      notifyError(apiErrorMessage(err, { fallback: copy.sendError }), {
        onRetry: () => void send(),
      });
    } finally {
      setSending(false);
    }
  }

  if (forbidden) {
    return (
      <EmptyState
        role="status"
        icon={<Lock aria-hidden />}
        title={copy.forbiddenTitle}
        description={copy.forbiddenHint}
      />
    );
  }
  if (error) {
    return (
      <SectionError
        description={error}
        onRetry={() => {
          setError(null);
          setReloadKey((k) => k + 1);
        }}
      />
    );
  }
  if (!receipt) {
    return (
      <p role="status" className="flex items-center gap-2 py-12 text-sm text-muted">
        <ReceiptText aria-hidden className="size-4" />
        {copy.loading}
      </p>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-lg border border-border">
        <PaymentReceiptDocument receipt={receipt} />
      </div>
      <DialogFooter className="print:hidden">
        <Button type="button" variant="outline" onClick={onClose}>
          {copy.close}
        </Button>
        <Button type="button" variant="outline" onClick={() => void send()} disabled={sending}>
          <Mail aria-hidden />
          {sending ? copy.sending : copy.send}
        </Button>
        <Button asChild variant="outline">
          <Link href={receiptPrintHref(paymentId, '80mm')} target="_blank" rel="noopener">
            <Printer aria-hidden />
            {copy.printRoll}
            <span className="sr-only">{copy.newTab}</span>
          </Link>
        </Button>
        <Button asChild>
          <Link href={receiptPrintHref(paymentId, 'a4')} target="_blank" rel="noopener">
            <Printer aria-hidden />
            {copy.printA4}
            <span className="sr-only">{copy.newTab}</span>
          </Link>
        </Button>
      </DialogFooter>
    </>
  );
}
