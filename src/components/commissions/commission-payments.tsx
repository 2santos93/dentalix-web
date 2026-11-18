'use client';
import * as React from 'react';
import { useId, useRef, useState } from 'react';
import { Check, Copy, Mail, MessageCircle } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  COMMISSION_PAYMENT_LIMITS,
  isLivePayment,
  mailtoHref,
  receiptRequestMessage,
  requestCommissionReceipt,
  voidCommissionPayment,
  whatsAppShareHref,
  type CommissionCurrencyPayment,
  type CommissionPayment,
  type CommissionReceiptLink,
} from '@/lib/commissions/commissions-api';
import { useCopyToClipboard } from '@/lib/hooks/use-copy-to-clipboard';
import type { SedeStamp } from '@/lib/locations/sede-stamp';
import { PAYMENT_METHOD_LABELS } from '@/lib/payments/payment-method';
import { InlineError } from '@/components/errors/inline-error';
import { ExternalLink } from '@/components/shared/external-link';
import { FormModal } from '@/components/shared/form-modal';
import type { RowAction } from '@/components/shared/row-actions';
import { Button } from '@/components/ui/button';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { DescriptionItem, DescriptionList } from '@/components/ui/description-list';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SectionHeader } from '@/components/ui/section-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export const commissionPaymentsCopy = {
  summary: 'Pagos por moneda',
  total: 'A pagar',
  paid: 'Pagado',
  pending: 'Pendiente',
  payments: 'Pagos',
  paymentsHint: 'Cada pago es un gasto de su sede. Anulado, deja de contar y sus líneas vuelven a pendientes.',
  paymentsLabel: 'Pagos de la liquidación, el más reciente primero',
  noPayments: 'Aún no hay pagos registrados.',
  colDate: 'Fecha',
  colMethod: 'Medio',
  colLocation: 'Sede',
  colAmount: 'Importe',
  colReceipt: 'Conformidad',
  reference: (ref: string) => `Ref. ${ref}`,
  voided: (reason: string) => `Anulado: ${reason}`,
  signedBy: (name: string) => `Firmó ${name}`,
  actionsOf: (amount: string, day: string) => `${amount} del ${day}`,
  requestReceipt: 'Pedir conformidad',
  requestAgain: 'Pedir otra vez la conformidad',
  downloadReceipt: 'Descargar recibo',
  downloadSigned: 'Descargar recibo firmado',
  void: 'Anular',
  voidedReason: 'Ya está anulado',
  signedReason: 'Ya firmó la conformidad',
  // Anular
  voidTitle: '¿Anular este pago?',
  voidDescription:
    'Se anula también su gasto en la sede (y la salida de caja, si la hubo). Las líneas vuelven a pendientes y el enlace de conformidad deja de servir.',
  voidSubmit: 'Anular pago',
  reasonLabel: 'Motivo de la anulación',
  reasonHint: `Entre ${COMMISSION_PAYMENT_LIMITS.voidReasonMin} y ${COMMISSION_PAYMENT_LIMITS.voidReasonMax} caracteres.`,
  reasonTooShort: `Escribe el motivo (al menos ${COMMISSION_PAYMENT_LIMITS.voidReasonMin} caracteres).`,
  voidError: 'No pudimos anular el pago. Intenta de nuevo.',
  // Conformidad
  receiptTitle: 'Pedir conformidad',
  receiptDescription:
    'El profesional abre el enlace, revisa el recibo (solo con las iniciales de los pacientes) y firma «Recibí conforme». Pedir otro anula el anterior.',
  receiptSubmit: 'Crear enlace',
  receiptError: 'No pudimos crear el enlace. Intenta de nuevo.',
  linkLabel: 'Enlace de conformidad',
  expires: (when: string) => `Caduca el ${when}. Sirve para una sola firma.`,
  copy: 'Copiar enlace',
  copied: 'Enlace copiado',
  copyFailed: 'No pudimos copiar automáticamente: cópialo a mano desde el campo.',
  byEmail: 'Enviar por email',
  byWhatsApp: 'Enviar por WhatsApp',
  close: 'Cerrar',
};

const copy = commissionPaymentsCopy;

/** Total, pagado y pendiente de cada moneda, cada una aparte (nunca sumadas). */
export function CommissionPaymentTotals({
  currencies,
  stamp,
}: {
  currencies: readonly CommissionCurrencyPayment[];
  stamp: SedeStamp;
}) {
  if (currencies.length === 0) return null;
  return (
    <section aria-label={copy.summary} className="flex flex-col gap-3">
      {currencies.map((c) => (
        <div key={c.currency} className="rounded-lg border border-border bg-surface p-4 sm:p-6">
          <DescriptionList columns={3}>
            <DescriptionItem label={`${copy.total} (${c.currency})`} numeric>
              {stamp.money(c.total, c.currency)}
            </DescriptionItem>
            <DescriptionItem label={copy.paid} numeric>
              {stamp.money(c.paid, c.currency)}
            </DescriptionItem>
            <DescriptionItem label={copy.pending} numeric>
              <span className={cn(c.pending > 0 && 'font-semibold')}>
                {stamp.money(c.pending > 0 ? c.pending : 0, c.currency)}
              </span>
            </DescriptionItem>
          </DescriptionList>
        </div>
      ))}
    </section>
  );
}

export interface PaymentActions {
  onRequestReceipt: (p: CommissionPayment) => void;
  onDownloadReceipt: (p: CommissionPayment) => void;
  onVoid: (p: CommissionPayment) => void;
}

/** La sección «Pagos»: cada pago con fecha, medio, ref., sede, importe y conformidad; anulado, tachado y con motivo. */
export function CommissionPaymentsSection({
  payments,
  stamp,
  actions,
}: {
  payments: readonly CommissionPayment[];
  stamp: SedeStamp;
  /** Solo ADMIN; sin ellas (DENTIST), la lista se lee sin acciones. */
  actions: PaymentActions | null;
}) {
  const titleId = useId();
  const dayOf = (p: CommissionPayment) => stamp.civilDate(p.paidOn);
  const columns: DataListColumn<CommissionPayment>[] = [
    {
      id: 'date',
      header: copy.colDate,
      mobile: 'primary',
      cell: (p) => (
        <span className={cn('flex flex-col', !isLivePayment(p) && 'text-muted')}>
          <span className={cn('tabular-nums', !isLivePayment(p) && 'line-through')}>{dayOf(p)}</span>
          {p.reference ? <span className="t-caption text-muted">{copy.reference(p.reference)}</span> : null}
          {p.voidReason ? (
            <span className="t-caption text-muted [overflow-wrap:anywhere]">{copy.voided(p.voidReason)}</span>
          ) : null}
        </span>
      ),
    },
    {
      id: 'method',
      header: copy.colMethod,
      cell: (p) => <StatusBadge kind="paymentMethod" status={p.method} />,
      mobileCell: (p) => PAYMENT_METHOD_LABELS[p.method],
    },
    {
      id: 'location',
      header: copy.colLocation,
      cell: (p) => p.location.name,
      showFrom: 'md',
    },
    {
      id: 'receipt',
      header: copy.colReceipt,
      cell: (p) =>
        isLivePayment(p) ? (
          <span className="flex flex-col items-start gap-1">
            <StatusBadge kind="commissionReceipt" status={p.receipt.status} />
            {p.receipt.signerName ? (
              <span className="t-caption text-muted">{copy.signedBy(p.receipt.signerName)}</span>
            ) : null}
          </span>
        ) : (
          <StatusBadge kind="expense" status="VOIDED" />
        ),
    },
    {
      id: 'amount',
      header: copy.colAmount,
      numeric: true,
      align: 'end',
      mobile: 'trailing',
      cell: (p) => (
        <span className={cn('font-medium tabular-nums', !isLivePayment(p) && 'text-muted line-through')}>
          {stamp.money(p.amount, p.currency, p.location.id)}
        </span>
      ),
    },
  ];

  function rowActions(p: CommissionPayment): RowAction[] {
    if (!actions) return [];
    const live = isLivePayment(p);
    const signed = p.receipt.status === 'SIGNED';
    return [
      {
        label: p.receipt.status === 'PENDING' || p.receipt.status === 'EXPIRED' ? copy.requestAgain : copy.requestReceipt,
        onSelect: () => actions.onRequestReceipt(p),
        disabledReason: !live ? copy.voidedReason : signed ? copy.signedReason : undefined,
      },
      {
        label: signed ? copy.downloadSigned : copy.downloadReceipt,
        onSelect: () => actions.onDownloadReceipt(p),
      },
      {
        label: copy.void,
        onSelect: () => actions.onVoid(p),
        destructive: true,
        separatorBefore: true,
        disabledReason: live ? undefined : copy.voidedReason,
      },
    ];
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby={titleId}>
      <SectionHeader titleId={titleId} title={copy.payments} description={copy.paymentsHint} />
      {payments.length === 0 ? (
        <p className="text-sm text-muted">{copy.noPayments}</p>
      ) : (
        <DataList
          label={copy.paymentsLabel}
          rows={payments}
          columns={columns}
          getRowKey={(p) => p.id}
          getRowLabel={(p) => copy.actionsOf(stamp.money(p.amount, p.currency, p.location.id), dayOf(p))}
          rowActions={actions ? rowActions : undefined}
        />
      )}
    </section>
  );
}

/** «Anular» un pago, con motivo (5–500). Se monta con una `key` por apertura. */
export function CommissionVoidPaymentDialog({
  token,
  payment,
  subject,
  open,
  onOpenChange,
  onVoided,
}: {
  token: string;
  payment: CommissionPayment;
  subject: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVoided: (payment: CommissionPayment) => void;
}) {
  const fieldId = useId();
  const [reason, setReason] = useState('');
  const [validation, setValidation] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = reason.trim();
    if (Array.from(trimmed).length < COMMISSION_PAYMENT_LIMITS.voidReasonMin) {
      setValidation(copy.reasonTooShort);
      return;
    }
    setValidation(null);
    setSubmitting(true);
    setError(null);
    try {
      onVoided(await voidCommissionPayment(token, payment.id, trimmed));
    } catch (err) {
      setError(apiErrorMessage(err, copy.voidError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.voidTitle}
      description={copy.voidDescription}
      onSubmit={(e) => void handleSubmit(e)}
      submitLabel={copy.voidSubmit}
      submitting={submitting}
      error={error}
      destructive
      touchTargets
    >
      <p className="rounded-lg bg-surface-sunken px-3 py-2 text-sm font-medium text-ink tabular-nums [overflow-wrap:anywhere]">
        {subject}
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={fieldId}>{copy.reasonLabel}</Label>
        <Textarea
          id={fieldId}
          name="reason"
          rows={3}
          maxLength={COMMISSION_PAYMENT_LIMITS.voidReasonMax}
          value={reason}
          disabled={submitting}
          onChange={(e) => {
            setReason(e.target.value);
            if (validation) setValidation(null);
          }}
          aria-invalid={validation ? true : undefined}
          aria-describedby={`${fieldId}-hint`}
          autoGrow
          className="max-h-48"
        />
        {validation ? (
          <InlineError id={`${fieldId}-hint`} className="text-xs">
            {validation}
          </InlineError>
        ) : (
          <p id={`${fieldId}-hint`} className="text-xs text-muted">
            {copy.reasonHint}
          </p>
        )}
      </div>
    </FormModal>
  );
}

/** El enlace con «Copiar», «Enviar por email» y «Enviar por WhatsApp». */
export function ReceiptLinkPanel({
  link,
  expires,
  email,
  message,
}: {
  link: CommissionReceiptLink;
  expires: string;
  email: string | null;
  message: { subject: string; body: string };
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const { state, copy: copyText } = useCopyToClipboard();
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-sunken p-3">
      <label htmlFor={id} className="t-caption text-muted">
        {copy.linkLabel}
      </label>
      <Input
        id={id}
        ref={inputRef}
        readOnly
        value={link.url}
        onFocus={(e) => e.currentTarget.select()}
        className="font-mono text-xs"
      />
      <p className="text-xs text-muted tabular-nums">{copy.expires(expires)}</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button
          type="button"
          variant="secondary"
          className="w-full sm:w-auto"
          onClick={() => {
            void copyText(link.url).then((ok) => {
              if (!ok) inputRef.current?.select();
            });
          }}
        >
          {state === 'copied' ? <Check aria-hidden /> : <Copy aria-hidden />} {copy.copy}
        </Button>
        <Button asChild variant="secondary" className="w-full sm:w-auto">
          <a href={mailtoHref(email, message.subject, message.body)}>
            <Mail aria-hidden /> {copy.byEmail}
          </a>
        </Button>
        <Button asChild variant="secondary" className="w-full sm:w-auto">
          <ExternalLink href={whatsAppShareHref(message.body)}>
            <MessageCircle aria-hidden /> {copy.byWhatsApp}
          </ExternalLink>
        </Button>
      </div>
      <p role="status" aria-live="polite" className="text-xs text-muted empty:hidden">
        {state === 'copied' ? copy.copied : state === 'failed' ? copy.copyFailed : ''}
      </p>
    </div>
  );
}

/**
 * «Pedir conformidad» de un pago: crea el enlace (72 h, un solo uso; pedir
 * otro revoca el anterior) y lo enseña con sus formas de enviarlo. La URL solo
 * existe en esta respuesta: cerrar el diálogo la pierde.
 */
export function CommissionReceiptRequestDialog({
  token,
  payment,
  professionalName,
  email,
  stamp,
  open,
  onOpenChange,
  onCreated,
}: {
  token: string;
  payment: CommissionPayment;
  professionalName: string;
  email: string | null;
  stamp: SedeStamp;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (link: CommissionReceiptLink) => void;
}) {
  const [link, setLink] = useState<CommissionReceiptLink | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const created = await requestCommissionReceipt(token, payment.id);
      setLink(created);
      onCreated(created);
    } catch (err) {
      setError(apiErrorMessage(err, copy.receiptError));
    } finally {
      setSubmitting(false);
    }
  }

  const amount = stamp.money(payment.amount, payment.currency, payment.location.id);
  const expires = link ? stamp.dateTime(link.expiresAt, payment.location.id) : '';
  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.receiptTitle}
      description={copy.receiptDescription}
      onSubmit={(e) => void handleSubmit(e)}
      submitLabel={copy.receiptSubmit}
      submitting={submitting}
      hideSubmit={link !== null}
      cancelLabel={link ? copy.close : undefined}
      error={error}
      touchTargets
    >
      <p className="rounded-lg bg-surface-sunken px-3 py-2 text-sm font-medium text-ink tabular-nums">
        {`${amount} · ${stamp.civilDate(payment.paidOn)} · ${PAYMENT_METHOD_LABELS[payment.method]}`}
      </p>
      {link ? (
        <ReceiptLinkPanel
          link={link}
          expires={expires}
          email={email}
          message={receiptRequestMessage({
            professionalName,
            amount,
            paidOn: stamp.civilDate(payment.paidOn),
            url: link.url,
            expires,
          })}
        />
      ) : null}
    </FormModal>
  );
}
