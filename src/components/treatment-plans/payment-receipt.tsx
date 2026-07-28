'use client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/format/currency';
import type { Payment, PaymentMethod, PlanBalance } from '@/lib/payments/payments-api';
import { formatCivilDate, formatDate } from '@/lib/format/date';

// Copy as constants (i18n-ready, es-first) — same convention as
// `treatment-plans-tab.tsx`'s `copy` object.
const copy = {
  title: 'Comprobante de abono',
  a11yDescription: 'Comprobante de abono del plan de tratamiento, listo para imprimir.',
  issuedAtLabel: 'Fecha de emisión',
  referenceLabel: 'Referencia',
  patientLabel: 'Paciente',
  planLabel: 'Plan',
  paymentSectionHeading: 'Abono',
  amountLabel: 'Monto',
  paymentDateLabel: 'Fecha del abono',
  methodLabel: 'Método',
  notesLabel: 'Notas',
  balanceSectionHeading: 'Saldo del plan (al momento de emitir)',
  billableLabel: 'A pagar',
  paidLabel: 'Pagado',
  balanceLabel: 'Saldo',
  signatureLine: 'Firma / sello',
  print: 'Imprimir',
  close: 'Cerrar',
  methodFallback: '—',
  notesFallback: '—',
  patientFallback: '—',
};

// Same method labels as `treatment-plans-tab.tsx`'s `PAYMENT_METHOD_LABELS`
// — duplicated (not imported) because the tab's copy is a local, unexported
// module constant, matching the sibling `PaymentsList` sub-component's
// existing pattern of keeping its own presentational mappings local.
const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
  OTHER: 'Otro',
};

/** `REC-<first 8 chars of payment.id>` — v1 receipt reference (see plan notes: real sequential numbering is a follow-up). */
function receiptReference(paymentId: string): string {
  return `REC-${paymentId.slice(0, 8)}`;
}

interface PaymentReceiptProps {
  /** The abono to show a receipt for, or `null` to keep the dialog closed. */
  payment: Payment | null;
  /** Current balance snapshot of the plan (billable/paid/balance, in `planCurrency`) — "al momento de emitir", not point-in-time-of-the-abono. */
  planBalance: PlanBalance | null;
  /** Plan label/date (e.g. `copy.planOptionLabel(...)` from the tab), rendered as-is. */
  planLabel: string;
  /** Patient's full name, fetched once by the tab — `null` renders a fallback. */
  patientName: string | null;
  /** Clinic name, fetched once by the tab (`GET /public/tenant/branding`) — `null` simply omits the clinic line. */
  clinicName: string | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Printable receipt (comprobante de abono) — RECIBO-T1. Mounted from
 * `TreatmentPlansTab` (via `PaymentsList`'s per-row "Recibo" button), one
 * instance shared across rows: `payment` doubles as both the dialog's open
 * flag (`payment !== null`) and which abono is being shown.
 *
 * Print-fidelity exception (documented, see `docs/plans/2026-07-26-payment-
 * receipt.md`): the printable area (`.receipt-print-root`, matched by the
 * `@media print` rules in `globals.css`) uses explicit light colors (white
 * background, dark text) instead of the app's dark-mode tokens — a physical
 * receipt must render on white paper regardless of the user's theme. This is
 * the ONLY place in the app that hardcodes colors instead of tokens, and
 * only inside this print artifact.
 */
export function PaymentReceipt({
  payment,
  planBalance,
  planLabel,
  patientName,
  clinicName,
  onOpenChange,
}: PaymentReceiptProps) {
  return (
    <Dialog open={payment !== null} onOpenChange={onOpenChange}>
      {payment && (
        <DialogContent className="receipt-print-root max-w-md !bg-white !text-[#111827]">
          <DialogHeader>
            {clinicName && <p className="text-sm font-semibold">{clinicName}</p>}
            <DialogTitle className="!text-[#111827]">{copy.title}</DialogTitle>
            <DialogDescription className="sr-only">{copy.a11yDescription}</DialogDescription>
            <p className="text-xs text-[#6b7280]">
              {copy.issuedAtLabel}: {formatDate(new Date().toISOString())} · {copy.referenceLabel}:{' '}
              {receiptReference(payment.id)}
            </p>
          </DialogHeader>

          <dl className="flex flex-col gap-4 text-sm">
            <div>
              <dt className="font-medium">{copy.patientLabel}</dt>
              <dd>{patientName ?? copy.patientFallback}</dd>
            </div>
            <div>
              <dt className="font-medium">{copy.planLabel}</dt>
              <dd>{planLabel}</dd>
            </div>

            <div className="border-t border-[#e5e7eb] pt-3">
              <h3 className="font-semibold">{copy.paymentSectionHeading}</h3>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-[#6b7280]">{copy.amountLabel}</dt>
                  <dd className="font-medium">{formatCurrency(payment.amount, payment.currency)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-[#6b7280]">{copy.paymentDateLabel}</dt>
                  <dd>{formatCivilDate(payment.paidAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-[#6b7280]">{copy.methodLabel}</dt>
                  <dd>{payment.method ? PAYMENT_METHOD_LABELS[payment.method] : copy.methodFallback}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-[#6b7280]">{copy.notesLabel}</dt>
                  <dd>{payment.notes ?? copy.notesFallback}</dd>
                </div>
              </div>
            </div>

            {planBalance && (
              <div className="border-t border-[#e5e7eb] pt-3">
                <h3 className="font-semibold">{copy.balanceSectionHeading}</h3>
                <div className="mt-2 grid grid-cols-3 gap-3">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-[#6b7280]">{copy.billableLabel}</dt>
                    <dd className="font-medium">
                      {formatCurrency(planBalance.billable, planBalance.planCurrency)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-[#6b7280]">{copy.paidLabel}</dt>
                    <dd className="font-medium">{formatCurrency(planBalance.paid, planBalance.planCurrency)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-[#6b7280]">{copy.balanceLabel}</dt>
                    <dd className="font-medium">
                      {formatCurrency(planBalance.balance, planBalance.planCurrency)}
                    </dd>
                  </div>
                </div>
              </div>
            )}
          </dl>

          <p className="border-t border-[#e5e7eb] pt-4 text-xs text-[#6b7280]">
            {copy.signatureLine}: ______________________
          </p>

          <div className="receipt-print-hide flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {copy.close}
            </Button>
            <Button type="button" onClick={() => window.print()}>
              {copy.print}
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
