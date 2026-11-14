'use client';
import type * as React from 'react';
import { toast } from 'sonner';
import type { TreatmentPlan, TreatmentPlanItem } from '@/lib/treatment-plans/treatment-plans-api';
import type { Payment } from '@/lib/payments/payments-api';
import type { DentalCatalogItem } from '@/lib/odontogram/catalog-api';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import type { DiscountRules } from '@/lib/discounts/discount-rules';
import type { readyFormat } from '@/lib/locations/use-sede-format';
import type { ClinicRole } from '@/lib/me/me-api';
import { getActiveLocationId } from '@/lib/locations/location-store';
import { contractRoundingDigits } from '@/lib/money/line-rounding';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { PaymentReceiptDialog } from '@/components/payments/payment-receipt-dialog';
import { ExternalInvoiceModal, type ExternalInvoiceTarget } from '@/components/payments/external-invoice-modal';
import { VoidPaymentModal } from '@/components/payments/void-payment-modal';
import { ReallocatePaymentModal } from '@/components/payments/reallocate-payment-modal';
import { PaymentAllocationDetailDialog } from '@/components/payments/payment-allocation-detail-dialog';
import { BulkDiscountModal } from '@/components/discounts/bulk-discount-modal';
import { VoidCancellationFeeModal } from '@/components/appointments/fee-reason-modal';
import { NewEvolutionModal } from '@/components/clinical-notes/new-evolution-modal';
import { MarkDoneModal } from './mark-done-modal';
import { copy, procedureName, splitLinesOf } from './treatment-plans-tab-copy';

/*
 * DX-117 (FE-021): los modales y diálogos de la pestaña «Plan de tratamiento»
 * (descuento en bloque, comprobante, recibo, factura externa, «Marcar como
 * realizado», evolución sugerida, anular cargo, quitar ítem, imputación y
 * anular abono). Solo pintan: qué está abierto y qué hacer al cerrar lo decide
 * `TreatmentPlansTab`.
 */

type BulkApplied = React.ComponentProps<typeof BulkDiscountModal>['onApplied'];
type InvoiceSaved = React.ComponentProps<typeof ExternalInvoiceModal>['onSaved'];
type FeeCloseAutoFocus = React.ComponentProps<typeof VoidCancellationFeeModal>['onCloseAutoFocus'];

export function TreatmentPlanModals({
  token,
  patientId,
  role,
  planDetail,
  catalogById,
  sedeFmt,
  // «Descuento %» en bloque (DX-204).
  discountRules,
  bulkKey,
  bulkOpen,
  onBulkOpenChange,
  selectedItemIds,
  onBulkApplied,
  // Comprobante, recibo y factura externa del abono.
  proofDialog,
  receiptPaymentId,
  onReceiptClose,
  payments,
  invoiceTarget,
  onInvoiceClose,
  onInvoiceSaved,
  // «Marcar como realizado» / «Corregir» (DX-050) y su evolución (DX-455).
  markDone,
  markDoneItem,
  onMarkDoneClose,
  locations,
  onRetryLocations,
  onMarkDoneSaved,
  suggestedEvolution,
  onSuggestedEvolutionClose,
  // Anular el cargo por inasistencia (SEC-050 / DX-343).
  feeToVoid,
  onFeeCloseAutoFocus,
  onFeeClose,
  onFeeDone,
  onFeeStale,
  // Quitar un ítem.
  itemToRemove,
  onRemoveClose,
  onRemoveConfirm,
  removing,
  removeItemError,
  // Imputación del abono (DX-051 / DX-399).
  viewAllocationPaymentId,
  onViewAllocationClose,
  onAllocationChange,
  allocation,
  onAllocationOpenChange,
  onAllocationSaved,
  onAllocationCloseAutoFocus,
  // Anular un abono.
  paymentToVoid,
  onVoidClose,
  onVoidConfirm,
  voiding,
  paymentActionError,
}: {
  token: string;
  patientId: string;
  role: ClinicRole | null;
  planDetail: TreatmentPlan | null;
  catalogById: Map<string, DentalCatalogItem>;
  sedeFmt: ReturnType<typeof readyFormat>;
  discountRules: DiscountRules | null;
  bulkKey: number;
  bulkOpen: boolean;
  onBulkOpenChange: (open: boolean) => void;
  selectedItemIds: ReadonlySet<string>;
  onBulkApplied: BulkApplied;
  proofDialog: React.ReactNode;
  receiptPaymentId: string | null;
  onReceiptClose: () => void;
  payments: Payment[];
  invoiceTarget: ExternalInvoiceTarget | null;
  onInvoiceClose: () => void;
  onInvoiceSaved: InvoiceSaved;
  markDone: { itemId: string; mode: 'done' | 'correct' } | null;
  markDoneItem: TreatmentPlanItem | null;
  onMarkDoneClose: () => void;
  locations: ClinicLocation[];
  onRetryLocations: () => void;
  onMarkDoneSaved: (saved: TreatmentPlanItem) => void;
  suggestedEvolution: { key: string; templateId: string; procedure: string } | null;
  onSuggestedEvolutionClose: () => void;
  feeToVoid: TreatmentPlanItem | null;
  onFeeCloseAutoFocus: FeeCloseAutoFocus;
  onFeeClose: () => void;
  onFeeDone: () => void;
  onFeeStale: () => void;
  itemToRemove: string | null;
  onRemoveClose: () => void;
  onRemoveConfirm: () => void | Promise<void>;
  removing: boolean;
  removeItemError: string | null;
  viewAllocationPaymentId: string | null;
  onViewAllocationClose: () => void;
  onAllocationChange?: (paymentId: string) => void;
  allocation: { paymentId: string; open: boolean; seq: number } | null;
  onAllocationOpenChange: (open: boolean) => void;
  onAllocationSaved: () => void;
  onAllocationCloseAutoFocus: (event: Event) => void;
  paymentToVoid: string | null;
  onVoidClose: () => void;
  onVoidConfirm: (reason: string) => void | Promise<void>;
  voiding: boolean;
  paymentActionError: string | null;
}) {
  return (
    <>
      {planDetail && discountRules ? (
        <BulkDiscountModal
          key={bulkKey}
          open={bulkOpen}
          onOpenChange={onBulkOpenChange}
          token={token}
          planId={planDetail.id}
          currency={planDetail.currency}
          roundingDigits={contractRoundingDigits(planDetail.currencyDigits)}
          items={(planDetail.items ?? []).filter((i) => selectedItemIds.has(i.id))}
          procedureOf={(item) => procedureName(item, catalogById)}
          rules={discountRules}
          role={role}
          fmt={sedeFmt}
          onApplied={onBulkApplied}
        />
      ) : null}

      {proofDialog}

      <PaymentReceiptDialog
        token={token}
        paymentId={receiptPaymentId}
        hasProof={payments.find((p) => p.id === receiptPaymentId)?.hasProof ?? false}
        onOpenChange={(open) => {
          if (!open) onReceiptClose();
        }}
      />

      {/* DX-515: `key` por abono, para empezar con su nº actual. */}
      <ExternalInvoiceModal
        key={invoiceTarget?.paymentId ?? 'no-invoice-target'}
        token={token}
        target={invoiceTarget}
        onOpenChange={(open) => {
          if (!open) onInvoiceClose();
        }}
        onSaved={onInvoiceSaved}
      />

      {markDone && markDoneItem && planDetail ? (
        <MarkDoneModal
          key={`${markDone.itemId}-${markDone.mode}`}
          open
          onOpenChange={(open) => {
            if (!open) onMarkDoneClose();
          }}
          token={token}
          planId={planDetail.id}
          item={markDoneItem}
          subject={copy.markDoneSubject(procedureName(markDoneItem, catalogById), markDoneItem.toothNumber)}
          mode={markDone.mode}
          // Se lee al abrir (tras un clic, sin riesgo de hidratación): es la
          // sede que el cliente HTTP manda en `X-Location-Id`.
          activeLocationId={getActiveLocationId()}
          locationName={locations.find((l) => l.id === getActiveLocationId())?.name ?? null}
          locations={locations}
          onRetryLocations={onRetryLocations}
          onSaved={onMarkDoneSaved}
        />
      ) : null}

      {suggestedEvolution ? (
        <NewEvolutionModal
          key={suggestedEvolution.key}
          open
          onOpenChange={(open) => {
            if (!open) onSuggestedEvolutionClose();
          }}
          token={token}
          patientId={patientId}
          suggestedTemplateId={suggestedEvolution.templateId}
          suggestedBy={suggestedEvolution.procedure}
          onCreated={() => toast.success(copy.evolutionSaved)}
        />
      ) : null}

      {feeToVoid?.cancellationFeeAppointmentId ? (
        <VoidCancellationFeeModal
          key={feeToVoid.id}
          token={token}
          appointmentId={feeToVoid.cancellationFeeAppointmentId}
          onCloseAutoFocus={onFeeCloseAutoFocus}
          onClose={onFeeClose}
          onDone={onFeeDone}
          onStale={onFeeStale}
        />
      ) : null}

      <ConfirmDialog
        open={itemToRemove !== null}
        onOpenChange={(open) => {
          if (!open) onRemoveClose();
        }}
        title={copy.removeConfirmTitle}
        description={copy.removeConfirmDescription}
        confirmLabel={copy.removeConfirm}
        onConfirm={onRemoveConfirm}
        confirming={removing}
        error={removeItemError}
      />

      <PaymentAllocationDetailDialog
        token={token}
        paymentId={viewAllocationPaymentId}
        onOpenChange={(open) => {
          if (!open) onViewAllocationClose();
        }}
        onChange={onAllocationChange}
      />

      {allocation ? (
        <ReallocatePaymentModal
          key={allocation.seq}
          open={allocation.open}
          onOpenChange={onAllocationOpenChange}
          paymentId={allocation.paymentId}
          token={token}
          onSaved={onAllocationSaved}
          onCloseAutoFocus={onAllocationCloseAutoFocus}
        />
      ) : null}

      {/* `key` por abono: cada anulación empieza con el motivo en blanco. */}
      <VoidPaymentModal
        key={paymentToVoid ?? 'none'}
        open={paymentToVoid !== null}
        onOpenChange={(open) => {
          if (!open) onVoidClose();
        }}
        onConfirm={onVoidConfirm}
        submitting={voiding}
        error={paymentActionError}
        // Pinta el aviso de la ventana de recepción; la regla la aplica la API.
        restrictedToOwnToday={role !== 'ADMIN'}
        splitLines={splitLinesOf(payments, paymentToVoid)}
      />
    </>
  );
}
