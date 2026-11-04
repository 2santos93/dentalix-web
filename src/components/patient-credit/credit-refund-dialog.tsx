'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Printer } from 'lucide-react';
import {
  getCreditRefund,
  refundPrintHref,
  type CreditRefund,
} from '@/lib/patient-credit/patient-credit-api';
import { apiErrorMessage } from '@/lib/api/error-message';
import { notifyError } from '@/components/errors/notify';
import { documentFormat } from '@/lib/format/document-format';
import { DocumentFormatNote } from '@/components/documents/document-format-note';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CreditRefundDocument } from './credit-refund-document';

const copy = {
  title: 'Devolución registrada',
  description: 'Imprime el comprobante y pide al paciente que lo firme.',
  close: 'Cerrar',
  printA4: 'Imprimir A4',
  printRoll: 'Tirilla 80 mm',
  newTab: '(se abre en otra pestaña)',
  rereadError: 'No pudimos volver a leer el comprobante.',
};

/** El comprobante recién emitido (DX-253), con impresión A4 o tirilla. */
export function CreditRefundDialog({
  token,
  refund: issued,
  onOpenChange,
}: {
  token: string;
  refund: CreditRefund | null;
  onOpenChange: (open: boolean) => void;
}) {
  // DX-354: «Reintentar» del aviso de la sede vuelve a leer el comprobante,
  // que trae el formato de la sede con sus valores de hoy.
  const [reread, setReread] = useState<CreditRefund | null>(null);
  const refund = reread && reread.id === issued?.id ? reread : issued;
  async function retryFormat() {
    if (!issued) return;
    try {
      setReread(await getCreditRefund(token, issued.id));
    } catch (err) {
      // Escalón 3: el comprobante sigue en pantalla; el aviso trae su reintento.
      notifyError(apiErrorMessage(err, { fallback: copy.rereadError }), { onRetry: () => void retryFormat() });
    }
  }
  return (
    <Dialog open={refund !== null} onOpenChange={onOpenChange}>
      {refund ? (
        <DialogContent className="max-w-3xl gap-3 p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>{copy.description}</DialogDescription>
          </DialogHeader>
          <DocumentFormatNote locationId={refund.locationId} onRetry={() => void retryFormat()} active={documentFormat(refund.regional) === null} />
          <div className="overflow-hidden rounded-lg border border-border">
            <CreditRefundDocument refund={refund} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {copy.close}
            </Button>
            <Button asChild variant="outline">
              <Link href={refundPrintHref(refund.id, '80mm')} target="_blank" rel="noopener">
                <Printer aria-hidden />
                {copy.printRoll}
                <span className="sr-only">{copy.newTab}</span>
              </Link>
            </Button>
            <Button asChild>
              <Link href={refundPrintHref(refund.id, 'a4')} target="_blank" rel="noopener">
                <Printer aria-hidden />
                {copy.printA4}
                <span className="sr-only">{copy.newTab}</span>
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
