'use client';
import type { TreatmentPlan } from '@/lib/treatment-plans/treatment-plans-api';
import { PLAN_STATUS_LABELS } from '@/lib/treatment-plans/plan-status';
import type { Payment, PlanBalance } from '@/lib/payments/payments-api';
import type { PlanPrimaryAction } from '@/lib/treatment-plans/plan-primary-action';
import type { SedeZoneState } from '@/lib/locations/use-sede-time-zone';
import type { readyFormat } from '@/lib/locations/use-sede-format';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/section-header';
import { Disclosure } from '@/components/shared/disclosure';
import { SectionError } from '@/components/errors/section-error';
import { PaymentPlanSection } from './payment-plan-section';
import { PlanPaymentFormModal } from './plan-payment-form-modal';
import { PlanPaymentsList } from './plan-payments-list';
import { PAYMENTS_TRIGGER_ID, copy } from './treatment-plans-tab-copy';

/*
 * DX-117 (FE-021): el bloque «Abonos» de la pestaña «Plan de tratamiento»
 * (solo roles de cobro): «Registrar abono», la lista plegada de abonos y el
 * plan de cuotas. Solo pinta: el estado y las acciones viven en
 * `TreatmentPlansTab`.
 */

export function PlanBillingSection({
  token,
  planDetail,
  selectedPlanId,
  primary,
  billable,
  onOpenPaymentForm,
  paymentsLoading,
  paymentsError,
  onRetryPayments,
  planBalance,
  paymentsRefreshing,
  paymentForm,
  onPaymentFormOpenChange,
  onRetryBalance,
  sedeZone,
  sedeFmt,
  locationHint,
  onRecorded,
  payments,
  voidingPaymentId,
  onVoid,
  onReceipt,
  manualPaymentIds,
  onAllocate,
  onViewAllocation,
  onViewProof,
  onExternalInvoice,
  paymentPlanRefreshSignal,
}: {
  token: string;
  planDetail: TreatmentPlan;
  selectedPlanId: string;
  primary: PlanPrimaryAction | null;
  billable: boolean;
  onOpenPaymentForm: () => void;
  paymentsLoading: boolean;
  paymentsError: string | null;
  onRetryPayments: () => void;
  planBalance: PlanBalance | null;
  paymentsRefreshing: boolean;
  paymentForm: { open: boolean; seq: number } | null;
  onPaymentFormOpenChange: (open: boolean) => void;
  onRetryBalance: () => void;
  sedeZone: SedeZoneState;
  sedeFmt: ReturnType<typeof readyFormat>;
  locationHint: string | null;
  onRecorded: () => Promise<void>;
  payments: Payment[];
  voidingPaymentId: string | null;
  onVoid: (paymentId: string) => void;
  onReceipt: (paymentId: string) => void;
  manualPaymentIds: ReadonlySet<string> | undefined;
  onAllocate?: (paymentId: string) => void;
  onViewAllocation?: (paymentId: string) => void;
  onViewProof?: (payment: Payment) => void;
  onExternalInvoice: (payment: Payment) => void;
  paymentPlanRefreshSignal: number;
}) {
  return (
    <div className="flex flex-col gap-4 border-t border-border-subtle pt-6">
      {/* La nota de alcance NO se repite aquí: vive una sola vez
          pegada a `PlanMoneySummary`. */}
      <SectionHeader
        as="h3"
        title={copy.paymentsHeading}
        actions={
          <Button
            type="button"
            variant={primary === 'registerPayment' ? 'default' : 'secondary'}
            size="sm"
            onClick={onOpenPaymentForm}
            disabled={!billable}
            aria-describedby={billable ? undefined : 'plan-not-billable-hint'}
          >
            {copy.registerPayment}
          </Button>
        }
      />
      {!billable && planDetail && (
        <p id="plan-not-billable-hint" className="text-sm text-muted">
          {copy.notBillableHint(PLAN_STATUS_LABELS[planDetail.status])}
        </p>
      )}

      {paymentsLoading && (
        <p role="status" className="text-sm text-muted">
          {copy.loadingBalance}
        </p>
      )}
      {paymentsError && (
        // Misma razón que en `planDetailError` (TreatmentPlansTab): la reload
        // key mantiene el fallo en el escalón 1 en vez de apilarle un toast
        // de escalón 3.
        <SectionError description={paymentsError} onRetry={onRetryPayments} />
      )}

      {!paymentsLoading && !paymentsError && planBalance && (
        <>
          {paymentsRefreshing && (
            <p role="status" aria-live="polite" className="t-caption text-muted">
              {copy.refreshing}
            </p>
          )}

          {paymentForm ? (
            <PlanPaymentFormModal
              key={`${planDetail.id}-${paymentForm.seq}`}
              token={token}
              open={paymentForm.open}
              onOpenChange={onPaymentFormOpenChange}
              plan={planDetail}
              planBalance={planBalance}
              onRetryBalance={onRetryBalance}
              sedeZone={sedeZone}
              sedeFmt={sedeFmt}
              locationHint={locationHint}
              onRecorded={onRecorded}
            />
          ) : null}

          {/* El detalle abono a abono se pliega; lo que decide si
              hace falta abrirlo —cuántos abonos hay— se queda en la
              propia fila, y el Saldo sigue arriba. Se esconde la
              TABLA, nunca el número. Abierta por defecto cuando aún
              no hay ningún abono, para que el vacío enseñe el
              siguiente paso. */}
          <Disclosure
            triggerId={PAYMENTS_TRIGGER_ID}
            summary={copy.paymentsDisclosure}
            meta={copy.paymentsDisclosureMeta(payments.length)}
            defaultOpen={payments.length === 0}
          >
            <PlanPaymentsList
              payments={payments}
              voidingPaymentId={voidingPaymentId}
              onVoid={onVoid}
              onReceipt={onReceipt}
              billable={billable}
              manualPaymentIds={manualPaymentIds}
              onAllocate={onAllocate}
              onViewAllocation={onViewAllocation}
              onViewProof={onViewProof}
              fmt={sedeFmt}
              onExternalInvoice={onExternalInvoice}
            />
          </Disclosure>

          <div className="border-t border-border-subtle pt-6">
            <PaymentPlanSection
              token={token}
              planId={selectedPlanId}
              planCurrency={planBalance.planCurrency}
              billable={planBalance.billable}
              canCreate={billable}
              refreshSignal={paymentPlanRefreshSignal}
              fmt={sedeFmt}
              onRetryBalance={onRetryBalance}
            />
          </div>
        </>
      )}
    </div>
  );
}
