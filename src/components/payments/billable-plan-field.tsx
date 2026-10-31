'use client';
import { billablePlanLabel, type BillablePlan, type MoneyFormatter } from '@/lib/payments/billable-plans-api';
import { formatCurrency } from '@/lib/format/currency';
import { FormField } from '@/components/shared/form-field';
import { FieldError } from '@/components/errors/field-error';
import { EmptyState } from '@/components/shared/empty-state';
import { NativeSelect } from '@/components/ui/native-select';
import type { BillablePlansState } from './use-billable-plans';

// Copy como constantes (i18n-ready).
export const billablePlanFieldCopy = {
  label: 'Plan',
  loading: 'Cargando planes…',
  // Escalón 2 (FieldError): ≤4 palabras, el contexto lo da la etiqueta.
  failed: 'No cargaron los planes',
  emptyTitle: 'Este paciente no tiene planes por cobrar.',
  emptyDescription:
    'Se cobra contra un plan de tratamiento con procedimientos aceptados. Cuando el odontólogo lo deje aceptado, aparecerá aquí.',
  // El saldo se repite aquí: en móvil el selector nativo recorta el nombre del plan.
  figures: (balance: string, total: string, paid: string) =>
    `Saldo ${balance} · Total ${total} · Abonado ${paid}`,
  inFavor: 'a favor',
  otherCurrencies: (list: string) => `También abonado en otra moneda: ${list}`,
};

interface BillablePlanFieldProps {
  id: string;
  state: BillablePlansState;
  value: string;
  onChange: (planId: string) => void;
  /** Motivo por el que un plan no se puede elegir aquí, o `null` si se puede. */
  unavailableReason?: (plan: BillablePlan) => string | null;
  disabled?: boolean;
  /** Cómo se pintan los importes (DX-386: el formato de la sede, si la pantalla lo tiene). */
  money?: MoneyFormatter;
}

/**
 * El selector de plan de los modales de cobro del estado de cuenta (DX-067),
 * con sus estados: cargando, fallo de la lista (escalón 2: sustituye al
 * control, con reintento) y el selector con las cifras del plan elegido. El
 * estado vacío lo pinta quien lo usa (`BillablePlansEmpty`), porque sin planes
 * no tiene sentido enseñar el resto del formulario.
 */
export function BillablePlanField({
  id,
  state,
  value,
  onChange,
  unavailableReason,
  disabled,
  money = formatCurrency,
}: BillablePlanFieldProps) {
  const selected = state.plans?.find((p) => p.id === value) ?? null;
  const hintId = `${id}-hint`;
  return (
    <FormField htmlFor={id} label={billablePlanFieldCopy.label}>
      {state.failed ? (
        <FieldError label={billablePlanFieldCopy.failed} onRetry={state.retry} />
      ) : state.plans === null ? (
        <p
          role="status"
          className="flex h-10 items-center rounded-lg border border-border bg-surface-sunken px-3 text-sm text-muted pointer-coarse:h-11"
        >
          {billablePlanFieldCopy.loading}
        </p>
      ) : (
        <>
          <NativeSelect
            id={id}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            aria-describedby={selected ? hintId : undefined}
          >
            {state.plans.map((plan) => {
              const reason = unavailableReason?.(plan) ?? null;
              return (
                <option key={plan.id} value={plan.id} disabled={reason !== null}>
                  {reason ? `${billablePlanLabel(plan, money)} (${reason})` : billablePlanLabel(plan, money)}
                </option>
              );
            })}
          </NativeSelect>
          {selected ? <PlanFigures id={hintId} plan={selected} money={money} /> : null}
        </>
      )}
    </FormField>
  );
}

function PlanFigures({ id, plan, money }: { id: string; plan: BillablePlan; money: MoneyFormatter }) {
  const others = plan.paidOtherCurrencies
    .map((o) => money(o.amount, o.currency))
    .join(', ');
  return (
    <p id={id} className="t-caption text-muted tabular-nums">
      {billablePlanFieldCopy.figures(
        plan.balance < 0
          ? `${money(-plan.balance, plan.currency)} ${billablePlanFieldCopy.inFavor}`
          : money(plan.balance, plan.currency),
        money(plan.total, plan.currency),
        money(plan.paid, plan.currency),
      )}
      {others ? (
        <span className="block">{billablePlanFieldCopy.otherCurrencies(others)}</span>
      ) : null}
    </p>
  );
}

/** Paciente sin nada que cobrar: lo dice y explica de qué depende. */
export function BillablePlansEmpty() {
  return (
    <EmptyState
      size="inline"
      role="status"
      title={billablePlanFieldCopy.emptyTitle}
      description={billablePlanFieldCopy.emptyDescription}
    />
  );
}
