'use client';
import Link from 'next/link';
import { Printer } from 'lucide-react';
import {
  refundPrintHref,
  type CreditRefund,
} from '@/lib/patient-credit/patient-credit-api';
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
};

/** El comprobante recién emitido (DX-253), con impresión A4 o tirilla. */
export function CreditRefundDialog({
  refund,
  onOpenChange,
}: {
  refund: CreditRefund | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={refund !== null} onOpenChange={onOpenChange}>
      {refund ? (
        <DialogContent className="max-w-3xl gap-3 p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>{copy.description}</DialogDescription>
          </DialogHeader>
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
