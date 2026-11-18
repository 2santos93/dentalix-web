'use client';
import { Disclosure } from '@/components/shared/disclosure';
import { StatusBadge } from '@/components/ui/status-badge';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import type { CancelledPaymentPlan, Periodicity } from '@/lib/payment-plans/payment-plan-api';

const PERIODICITY_LABEL: Record<Periodicity, { one: string; many: string }> = {
  WEEKLY: { one: 'semanal', many: 'semanales' },
  BIWEEKLY: { one: 'quincenal', many: 'quincenales' },
  MONTHLY: { one: 'mensual', many: 'mensuales' },
};

export const cancelledPaymentPlansCopy = {
  summary: 'Planes de pagos cancelados',
  count: (n: number) => (n === 1 ? '1 plan' : `${n} planes`),
  terms: (count: number, periodicity: Periodicity) =>
    count === 1
      ? `1 cuota ${PERIODICITY_LABEL[periodicity].one}`
      : `${count} cuotas ${PERIODICITY_LABEL[periodicity].many}`,
  total: (amount: string) => `Total ${amount}`,
  downPayment: (amount: string) => `pie ${amount}`,
  by: (name: string) => `por ${name}`,
  // Puntero suave: un autor que ya no es de la clínica no tiene nombre.
  unknownAuthor: 'por un usuario que ya no está en la clínica',
  reason: 'Motivo',
  // Cancelados antes de DX-109: no se guardaba ni autor ni motivo.
  noReason: 'Sin motivo registrado (se canceló antes de que se guardara).',
};

/**
 * DX-123 (O-2): el rastro de los planes de cuotas cancelados de un plan de
 * tratamiento: «Cancelado», cuándo, quién y por qué. Plegado por defecto (el
 * plan activo es lo que se trabaja), con el recuento a la vista. Un plan de
 * cuotas no tiene sede: se pinta con la de la pantalla.
 */
export function CancelledPaymentPlans({ token, plans }: { token: string; plans: CancelledPaymentPlan[] }) {
  const stamp = useSedeStamp(token);
  return (
    <div className="flex flex-col gap-2">
      {/* Siempre montado: la región `status` se llena después (DESIGN «Dates and times»). */}
      <SedeStampNote stamp={stamp} />
      {plans.length > 0 ? (
        <Disclosure summary={cancelledPaymentPlansCopy.summary} meta={cancelledPaymentPlansCopy.count(plans.length)}>
          <ul className="flex flex-col divide-y divide-border-subtle">
            {plans.map((plan) => (
              <li key={plan.id} className="flex flex-col gap-1.5 py-3 first:pt-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <StatusBadge kind="paymentPlan" status="CANCELLED" />
                  {/* La insignia ya dice «Cancelado»: aquí, cuándo. */}
                  <span className="text-sm text-ink tabular-nums">{stamp.date(plan.cancelledAt)}</span>
                  {plan.cancelledBy ? (
                    <span className="text-sm text-muted">
                      {plan.cancelledBy.fullName
                        ? cancelledPaymentPlansCopy.by(plan.cancelledBy.fullName)
                        : cancelledPaymentPlansCopy.unknownAuthor}
                    </span>
                  ) : null}
                </div>
                <p className="t-caption text-muted tabular-nums">
                  {cancelledPaymentPlansCopy.total(stamp.money(plan.totalToFinance, plan.currency))}
                  {plan.downPayment > 0
                    ? ` · ${cancelledPaymentPlansCopy.downPayment(stamp.money(plan.downPayment, plan.currency))}`
                    : ''}
                  {' · '}
                  {cancelledPaymentPlansCopy.terms(plan.installmentsCount, plan.periodicity)}
                </p>
                {plan.cancelReason ? (
                  <p className="break-words text-sm text-ink">
                    <span className="text-muted">{cancelledPaymentPlansCopy.reason}: </span>
                    {plan.cancelReason}
                  </p>
                ) : (
                  <p className="text-sm text-muted">{cancelledPaymentPlansCopy.noReason}</p>
                )}
              </li>
            ))}
          </ul>
        </Disclosure>
      ) : null}
    </div>
  );
}
