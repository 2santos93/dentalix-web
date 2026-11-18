'use client';
import * as React from 'react';
import { Mail, MessageCircle } from 'lucide-react';
import {
  mailtoHref,
  settlementShareMessage,
  whatsAppShareHref,
  type CommissionReceiptLink,
  type CommissionSettlement,
} from '@/lib/commissions/commissions-api';
import type { SedeStamp } from '@/lib/locations/sede-stamp';
import { statusLabel } from '@/lib/status/tones';
import { ExternalLink } from '@/components/shared/external-link';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export const commissionSendDialogCopy = {
  title: 'Enviar la liquidación',
  description:
    'Abre tu correo o WhatsApp con el resumen ya escrito: período, totales por moneda y estado de pago.',
  attach: 'Adjunta el PDF que descargaste con «Descargar PDF»: el mensaje no lo lleva.',
  receiptIncluded: 'El mensaje incluye el enlace de conformidad que acabas de crear.',
  noEmail: 'El profesional no tiene email en su cuenta: escribe la dirección en tu correo.',
  byEmail: 'Por email',
  byWhatsApp: 'Por WhatsApp',
  close: 'Cerrar',
};

const copy = commissionSendDialogCopy;

/**
 * «Enviar» la liquidación (DX-464) sin proveedor nuevo: `mailto:` al email
 * del profesional y `wa.me/?text=`. El PDF se descarga aparte y se adjunta a
 * mano (el correo no admite adjuntos por enlace).
 */
export function CommissionSendDialog({
  settlement,
  stamp,
  receiptLink,
  open,
  onOpenChange,
}: {
  settlement: CommissionSettlement;
  stamp: SedeStamp;
  /** El último enlace de conformidad creado en esta sesión, si hay. */
  receiptLink: CommissionReceiptLink | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const message = settlementShareMessage(
    {
      professionalName: settlement.professional.name,
      period: settlement.period,
      currencies: settlement.payment.currencies,
      statusLabel: statusLabel('commissionPayment', settlement.payment.status),
      receiptUrl: receiptLink?.url ?? null,
    },
    { civilDate: (d) => stamp.civilDate(d), amount: (a, c) => stamp.money(a, c) },
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Callout tone="info">{copy.attach}</Callout>
          {receiptLink ? <p className="text-sm text-muted">{copy.receiptIncluded}</p> : null}
          {settlement.professionalEmail ? null : <p className="text-sm text-muted">{copy.noEmail}</p>}
          <pre className="max-h-48 overflow-auto rounded-lg bg-surface-sunken p-3 font-sans text-xs whitespace-pre-wrap text-ink [overflow-wrap:anywhere]">
            {message.body}
          </pre>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild className="w-full sm:w-auto">
              <a href={mailtoHref(settlement.professionalEmail, message.subject, message.body)}>
                <Mail aria-hidden /> {copy.byEmail}
              </a>
            </Button>
            <Button asChild variant="secondary" className="w-full sm:w-auto">
              <ExternalLink href={whatsAppShareHref(`${message.subject}\n\n${message.body}`)}>
                <MessageCircle aria-hidden /> {copy.byWhatsApp}
              </ExternalLink>
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {copy.close}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
