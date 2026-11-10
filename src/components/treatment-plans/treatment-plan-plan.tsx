'use client';
import { isPendingRest } from '@/lib/treatment-plans/plan-quote-api';
import type { TreatmentPlan, TreatmentPlanStatus } from '@/lib/treatment-plans/treatment-plans-api';
import { PLAN_STATUS_LABELS } from '@/lib/treatment-plans/plan-status';
import type { SedeStamp } from '@/lib/locations/sede-stamp';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { SectionHeader } from '@/components/ui/section-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { FormField } from '@/components/shared/form-field';
import { EmptyState } from '@/components/shared/empty-state';
import { CurrencySelect } from '@/components/shared/currency-select';
import { InlineError } from '@/components/errors/inline-error';
import { QuoteValidity } from './quote-validity';
import { copy } from './treatment-plans-tab-copy';

/*
 * DX-117 (FE-021): el bloque «Planes» (moneda, «Nuevo plan» y selector) y la
 * cabecera del plan elegido (estado, validez y enlaces de la partición) de la
 * pestaña «Plan de tratamiento». Solo pintan: el estado y las acciones viven
 * en `TreatmentPlansTab`.
 */

export function PlanSelectorSection({
  token,
  newPlanCurrency,
  onNewPlanCurrencyChange,
  newPlanVariant,
  creatingPlan,
  onCreatePlan,
  createPlanError,
  stamp,
  planCreated,
  planReused,
  plans,
  selectedPlanId,
  onSelectPlan,
}: {
  token: string;
  newPlanCurrency: string;
  onNewPlanCurrencyChange: (code: string) => void;
  newPlanVariant: 'default' | 'secondary';
  creatingPlan: boolean;
  onCreatePlan: () => void;
  createPlanError: string | null;
  stamp: SedeStamp;
  planCreated: boolean;
  planReused: boolean;
  plans: TreatmentPlan[];
  selectedPlanId: string | null;
  onSelectPlan: (planId: string) => void;
}) {
  return (
    <section className="flex flex-col gap-4" aria-labelledby="tp-plans-heading">
      <SectionHeader
        titleId="tp-plans-heading"
        title={copy.plansHeading}
        actions={
          // A 390px la moneda y «Nuevo plan» no caben junto al título: bajan
          // a su propia fila.
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <CurrencySelect
              id="tp-new-plan-currency"
              token={token}
              value={newPlanCurrency}
              onChange={onNewPlanCurrencyChange}
              placeholder={newPlanCurrency ? undefined : copy.newPlanCurrencyPlaceholder}
              className="min-w-0 flex-1 sm:w-44 sm:flex-none"
              ariaLabel={copy.newPlanCurrencyLabel}
            />
            <Button type="button" variant={newPlanVariant} onClick={onCreatePlan} disabled={creatingPlan}>
              {creatingPlan ? copy.creatingPlan : copy.newPlan}
            </Button>
          </div>
        }
      />
      {createPlanError && <InlineError>{createPlanError}</InlineError>}
      <SedeStampNote stamp={stamp} />
      {planCreated && !createPlanError && (
        <p role="status" className="text-sm font-medium text-success-text">
          {copy.planCreated}
        </p>
      )}
      {planReused && !createPlanError && (
        <p role="status" className="text-sm font-medium text-ink">
          {copy.planReused}
        </p>
      )}
      {plans.length === 0 ? (
        <EmptyState role="status" title={copy.emptyPlansTitle} description={copy.emptyPlansDescription} />
      ) : (
        <FormField htmlFor="tp-plan-select" label={copy.selectPlanLabel} className="sm:max-w-md">
          <NativeSelect id="tp-plan-select" value={selectedPlanId ?? ''} onChange={(e) => onSelectPlan(e.target.value)}>
            {plans.map((plan, index) => (
              <option key={plan.id} value={plan.id}>
                {copy.planOptionLabel(
                  plan.createdAt,
                  plan.status,
                  index + 1,
                  plan.optionLabel,
                  stamp,
                  isPendingRest(plan),
                )}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      )}
    </section>
  );
}

export function PlanDetailHeader({
  selectedPlan,
  stamp,
  splitLinks,
  onSelectPlan,
  planDetail,
  acceptHiddenByExpiry,
  updatingPlanStatus,
  statusChoices,
  onPlanStatusChange,
}: {
  selectedPlan: TreatmentPlan | null;
  stamp: SedeStamp;
  splitLinks: { planId: string; label: string }[];
  onSelectPlan: (planId: string) => void;
  planDetail: TreatmentPlan | null;
  acceptHiddenByExpiry: boolean;
  updatingPlanStatus: boolean;
  statusChoices: TreatmentPlanStatus[];
  onPlanStatusChange: (status: TreatmentPlanStatus) => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <h2 id="tp-detail-heading" className="t-title text-ink">
          {copy.detailHeading}
        </h2>
        {selectedPlan ? (
          <p data-testid="tp-plan-status-line" className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <StatusBadge kind="treatmentPlan" status={selectedPlan.status} />
            {/* DX-379: hasta qué día valen los precios (o desde cuándo no). */}
            <QuoteValidity
              status={selectedPlan.status}
              validUntil={selectedPlan.quoteValidUntil}
              expired={selectedPlan.quoteExpired}
              locationId={selectedPlan.presentedLocationId}
              stamp={stamp}
            />
            {selectedPlan.optionLabel ? (
              <span className="text-sm font-medium text-muted">{selectedPlan.optionLabel}</span>
            ) : null}
            {/* DX-417: aceptado en parte, o el presupuesto pendiente que dejó. */}
            {selectedPlan.partialPendingPlanId ? (
              <StatusBadge kind="planSplit" status="PARTIAL" />
            ) : isPendingRest(selectedPlan) ? (
              <StatusBadge kind="planSplit" status="PENDING_REST" />
            ) : null}
          </p>
        ) : null}
        {splitLinks.map((link) => (
          <p key={link.planId} className="text-sm">
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0 text-left whitespace-normal tabular-nums"
              onClick={() => onSelectPlan(link.planId)}
            >
              {link.label}
            </Button>
          </p>
        ))}
      </div>
      {planDetail && (
        <FormField
          htmlFor="tp-plan-status"
          label={copy.planStatusLabel}
          className="sm:w-56"
          hint={acceptHiddenByExpiry ? copy.planStatusExpiredHint : undefined}
          hintId="tp-plan-status-hint"
        >
          {/* Solo el estado actual y sus transiciones (máquina de
              estados, DX-040): presentar y rechazar tienen botón
              propio, y aceptar es de odontólogo y ADMIN. */}
          <NativeSelect
            id="tp-plan-status"
            value={planDetail.status}
            disabled={updatingPlanStatus || statusChoices.length === 1}
            aria-describedby={acceptHiddenByExpiry ? 'tp-plan-status-hint' : undefined}
            onChange={(e) => onPlanStatusChange(e.target.value as TreatmentPlanStatus)}
          >
            {statusChoices.map((status) => (
              <option key={status} value={status}>
                {PLAN_STATUS_LABELS[status]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      )}
    </div>
  );
}
