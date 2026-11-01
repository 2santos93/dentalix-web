'use client';
import { Badge } from '@/components/ui/badge';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import type { RowAction } from '@/components/shared/row-actions';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { sedeCivilDate, sedeMoney } from '@/lib/format/sede-number';
import { frozenRateLabel, paymentRateCopy } from '@/lib/payments/payment-rate';
import type { Payment } from '@/lib/payments/payments-api';
import { statusLabel } from '@/lib/status/tones';
import { copy } from './treatment-plans-tab-copy';
import { externalInvoiceCopy } from '@/components/payments/external-invoice-modal';

/**
 * DX-375: «Sin tasa» junto al importe de un abono que no tenía tasa de su día
 * (el saldo no lo cuenta todavía). El motivo va en texto para lectores de
 * pantalla, no solo en el color.
 */
function PaymentMissingRateBadge({ payment }: { payment: Payment }) {
  if (payment.exchangeRateStatus !== 'MISSING') return null;
  return (
    <Badge variant="warning">
      {paymentRateCopy.missing}
      <span className="sr-only">: {paymentRateCopy.missingHelp}</span>
    </Badge>
  );
}

/** DX-375: la tasa que congeló un abono en otra moneda, bajo su importe, con el formato de la sede (DX-378). */
function PaymentFrozenRate({ payment, fmt }: { payment: Payment; fmt: RegionalFormat | null }) {
  const label = frozenRateLabel(payment, fmt);
  if (!label) return null;
  return <span className="t-caption mt-0.5 block font-normal text-muted tabular-nums">{label}</span>;
}

interface PlanPaymentsListProps {
  payments: Payment[];
  voidingPaymentId: string | null;
  onVoid: (paymentId: string) => void;
  /** Abre el recibo de caja del abono (DX-136). */
  onReceipt: (paymentId: string) => void;
  /** Plan rechazado o cancelado (DX-109): el vacío no invita a registrar un abono. */
  billable?: boolean;
  /** DX-051: abonos cuya imputación fijó un ADMIN a mano (`balance.manualPaymentIds`). */
  manualPaymentIds?: ReadonlySet<string>;
  /** DX-051: abre «Imputar abono»; solo ADMIN y en un plan que se cobra. */
  onAllocate?: (paymentId: string) => void;
  /** DX-375/DX-378/DX-386: formato de la sede para importe, día y tasa congelada; `null` mientras carga («—»). */
  fmt: RegionalFormat | null;
  /** DX-515: anota el nº de la factura fiscal externa del abono (ADMIN y recepción). */
  onExternalInvoice?: (payment: Payment) => void;
}

/** El nombre de la fila para el «⋯»: «Acciones de abono PRI-000001» (o su importe, sin serie). */
export function paymentRowLabel(payment: Payment, fmt: RegionalFormat | null): string {
  return `abono ${payment.receiptNumber ?? sedeMoney(payment.amount, payment.currency, fmt)}`;
}

/** El «⋯» de la fila de un abono, si sigue en pantalla (destino del foco al cerrar un modal). */
export function paymentRowActionsButton(payment: Payment, fmt: RegionalFormat | null): HTMLElement | null {
  const name = `Acciones de ${paymentRowLabel(payment, fmt)}`;
  return (
    Array.from(document.querySelectorAll<HTMLElement>('button[aria-label]')).find(
      (b) => b.getAttribute('aria-label') === name,
    ) ?? null
  );
}

/**
 * Los abonos del plan (UX v2): `DataList` — tabla desde `sm`, tarjeta compacta
 * de dos líneas en el teléfono (fecha + importe / método · recibo · notas).
 * Recibo, Imputación y Anular van en el «⋯» de la fila: antes eran tres botones
 * con borde por fila y «Anular», destructivo, pesaba lo mismo que «Recibo».
 * Anular sigue pasando por su confirmación con motivo.
 */
export function PlanPaymentsList({
  payments,
  voidingPaymentId,
  onVoid,
  onReceipt,
  billable = true,
  manualPaymentIds,
  onAllocate,
  fmt,
  onExternalInvoice,
}: PlanPaymentsListProps) {
  const columns: DataListColumn<Payment>[] = [
    {
      id: 'date',
      header: copy.colPaymentDate,
      mobile: 'primary',
      cell: (p) => <span className="tabular-nums">{sedeCivilDate(p.paidOn, fmt)}</span>,
    },
    {
      id: 'receipt',
      header: copy.colPaymentReceipt,
      cell: (p) => (
        <>
          {p.receiptNumber ? (
            <span className="t-id">{p.receiptNumber}</span>
          ) : (
            <span className="text-muted">{copy.paymentReceiptLegacy}</span>
          )}
          {/* DX-515: la factura fiscal emitida fuera, bajo su recibo. */}
          {p.externalInvoiceNumber ? (
            <span className="t-caption mt-0.5 block break-all font-mono text-muted">
              {externalInvoiceCopy.inline(p.externalInvoiceNumber)}
            </span>
          ) : null}
        </>
      ),
      // En el teléfono, las marcas van en la línea 2: en la 1 recortarían la fecha.
      mobileCell: (p) => (
        <>
          {copy.paymentReceiptMobile(p.receiptNumber)}
          {p.externalInvoiceNumber ? ` · ${externalInvoiceCopy.inline(p.externalInvoiceNumber)}` : null}
          {manualPaymentIds?.has(p.id) ? (
            <>
              {' '}
              <Badge variant="neutral">{copy.manualAllocation}</Badge>
            </>
          ) : null}
          {p.exchangeRateStatus === 'MISSING' ? (
            <>
              {' '}
              <PaymentMissingRateBadge payment={p} />
            </>
          ) : null}
        </>
      ),
    },
    {
      id: 'amount',
      header: copy.colPaymentAmount,
      numeric: true,
      mobile: 'trailing',
      cell: (p) => (
        <span className="inline-flex flex-col items-end">
          <span className="inline-flex flex-wrap items-center justify-end gap-2 font-medium text-ink">
            {manualPaymentIds?.has(p.id) ? <Badge variant="neutral">{copy.manualAllocation}</Badge> : null}
            <PaymentMissingRateBadge payment={p} />
            {sedeMoney(p.amount, p.currency, fmt)}
          </span>
          <PaymentFrozenRate payment={p} fmt={fmt} />
        </span>
      ),
      mobileCell: (p) => sedeMoney(p.amount, p.currency, fmt),
    },
    {
      id: 'method',
      header: copy.colPaymentMethod,
      cell: (p) =>
        p.method ? (
          <StatusBadge kind="paymentMethod" status={p.method} />
        ) : (
          <span className="text-muted">{copy.paymentMethodFallback}</span>
        ),
      mobileCell: (p) => (p.method ? statusLabel('paymentMethod', p.method) : null),
    },
    {
      id: 'notes',
      header: copy.colPaymentNotes,
      cell: (p) => <span className="text-muted">{p.notes ?? copy.paymentNotesFallback}</span>,
      mobileCell: (p) => p.notes ?? null,
    },
  ];

  function actionsFor(p: Payment): RowAction[] {
    const voiding = voidingPaymentId === p.id;
    const actions: RowAction[] = [{ label: copy.receiptAction, onSelect: () => onReceipt(p.id) }];
    if (onExternalInvoice) {
      actions.push({ label: externalInvoiceCopy.action, onSelect: () => onExternalInvoice(p) });
    }
    if (onAllocate) {
      actions.push({
        label: copy.allocationAction,
        onSelect: () => onAllocate(p.id),
      });
    }
    actions.push({
      label: voiding ? copy.voidingPayment : copy.voidPaymentAction,
      onSelect: () => onVoid(p.id),
      disabled: voiding,
      destructive: true,
      separatorBefore: true,
    });
    return actions;
  }

  return (
    <DataList
      label={copy.paymentsTableCaption}
      rows={payments}
      columns={columns}
      getRowKey={(p) => p.id}
      rowActions={actionsFor}
      getRowLabel={(p) => paymentRowLabel(p, fmt)}
      empty={
        <EmptyState
          size="inline"
          role="status"
          title={copy.emptyPaymentsTitle}
          description={billable ? copy.emptyPaymentsDescription : undefined}
        />
      }
    />
  );
}
