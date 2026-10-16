'use client';
import { useState } from 'react';
import { statementCopy } from '@/lib/account-statement/presentation';
import type { BillablePlan } from '@/lib/payments/billable-plans-api';
import { CreatePaymentPlanModal } from '@/components/payment-plans/create-payment-plan-modal';
import { BillablePlanField, BillablePlansEmpty } from '@/components/payments/billable-plan-field';
import { useBillablePlans } from '@/components/payments/use-billable-plans';

// Copy como constantes (i18n-ready).
const copy = {
  hasPaymentPlan: 'ya tiene plan de cuotas',
  allHavePaymentPlan:
    // Recepción no ve el plan de tratamiento (clínico): quien cancela es ADMIN.
    'Todos los planes de este paciente ya tienen un plan de cuotas activo. Para cambiar uno, un administrador debe cancelarlo desde el plan de tratamiento.',
  created: (plan: string) => `Plan de cuotas creado para el ${plan.toLowerCase()}.`,
};

function unavailableReason(plan: BillablePlan): string | null {
  return plan.hasActivePaymentPlan ? copy.hasPaymentPlan : null;
}

interface StatementPaymentPlanModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patientId: string;
  /** Tras crear, con el aviso a enseñar: quien abre cierra y recarga. */
  onCreated: (notice: string) => void;
}

/**
 * «Plan de cuotas» desde el estado de cuenta (DX-067): el mismo modal que el
 * plan de tratamiento (`CreatePaymentPlanModal`) con un selector de plan
 * delante, entre los cobrables del paciente. Un plan que ya tiene un plan de
 * cuotas activo aparece pero no se puede elegir (la API respondería 409).
 */
export function StatementPaymentPlanModal({
  open,
  onOpenChange,
  token,
  patientId,
  onCreated,
}: StatementPaymentPlanModalProps) {
  const billable = useBillablePlans(token, patientId, open);
  const [planId, setPlanId] = useState('');

  // Ajuste durante el render: cada apertura vuelve al primer plan disponible.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setPlanId('');
  }

  const plans = billable.plans ?? [];
  const available = plans.filter((p) => unavailableReason(p) === null);
  const plan = available.find((p) => p.id === planId) ?? available[0] ?? null;
  const noPlans = billable.plans !== null && plans.length === 0;

  return (
    <CreatePaymentPlanModal
      open={open}
      onOpenChange={onOpenChange}
      token={token}
      plan={plan ? { id: plan.id, currency: plan.currency, billable: plan.total } : null}
      onCreated={() => {
        if (plan) onCreated(copy.created(statementCopy.planLabel(plan.createdAt)));
      }}
    >
      {noPlans ? (
        <BillablePlansEmpty />
      ) : (
        <>
          <BillablePlanField
            id="spp-plan"
            state={billable}
            value={plan?.id ?? ''}
            onChange={setPlanId}
            unavailableReason={unavailableReason}
          />
          {plans.length > 0 && available.length === 0 ? (
            <p role="status" className="text-sm text-muted">
              {copy.allHavePaymentPlan}
            </p>
          ) : null}
        </>
      )}
    </CreatePaymentPlanModal>
  );
}
