'use client';
import type { PaymentMethod } from '@/lib/payments/payments-api';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHOD_OPTIONS } from '@/lib/payments/payment-method';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { Input } from '@/components/ui/input';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';

export const expensePaymentFieldsCopy = {
  method: 'Medio de pago',
  paidOn: 'Fecha del pago',
  fromCash: 'Desde mi caja abierta',
  fromCashHint:
    'Sale del cajón de tu caja abierta en la sede del gasto y baja su efectivo esperado. Solo en efectivo y con fecha de hoy.',
  paidOnRequired: 'Elige la fecha del pago.',
  paidOnFuture: 'La fecha del pago no puede ser futura.',
};

export interface ExpensePaymentValue {
  method: PaymentMethod;
  paidOn: string;
  fromCashSession: boolean;
}

/** Lo que se envía: desde la caja, efectivo y hoy (lo pone la API). */
export function paymentBody(value: ExpensePaymentValue): {
  method: PaymentMethod;
  paidOn?: string;
  fromCashSession: boolean;
} {
  return value.fromCashSession
    ? { method: 'CASH', fromCashSession: true }
    : { method: value.method, paidOn: value.paidOn, fromCashSession: false };
}

/** El error de la fecha del pago, o null. `today` es hoy en la sede del gasto. */
export function paidOnError(value: ExpensePaymentValue, today: string): string | null {
  if (value.fromCashSession) return null;
  if (!value.paidOn) return expensePaymentFieldsCopy.paidOnRequired;
  if (value.paidOn > today) return expensePaymentFieldsCopy.paidOnFuture;
  return null;
}

interface ExpensePaymentFieldsProps {
  idPrefix: string;
  value: ExpensePaymentValue;
  onChange: (value: ExpensePaymentValue) => void;
  /** Hoy en la sede del gasto (DX-097): tope de la fecha y fecha de la caja. */
  today: string;
  paidOnErrorText?: string | null;
  disabled?: boolean;
}

/**
 * Medio, fecha y «Desde mi caja abierta» de un pago de gasto (DX-274, R1): en
 * el alta («Ya está pagado») y en «Registrar pago». Desde la caja el pago es
 * en efectivo y de hoy, así que la fecha se fija y no se edita.
 */
export function ExpensePaymentFields({
  idPrefix,
  value,
  onChange,
  today,
  paidOnErrorText,
  disabled = false,
}: ExpensePaymentFieldsProps) {
  const id = (suffix: string) => `${idPrefix}-${suffix}`;
  const cash = value.method === 'CASH';
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField htmlFor={id('method')} label={expensePaymentFieldsCopy.method}>
          <select
            id={id('method')}
            value={value.method}
            disabled={disabled}
            onChange={(e) => {
              const method = e.target.value as PaymentMethod;
              onChange({ ...value, method, fromCashSession: method === 'CASH' && value.fromCashSession });
            }}
            className={cn(fieldClass, 'h-10')}
          >
            {PAYMENT_METHOD_OPTIONS.map((method) => (
              <option key={method} value={method}>
                {PAYMENT_METHOD_LABELS[method]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField htmlFor={id('paid-on')} label={expensePaymentFieldsCopy.paidOn} error={paidOnErrorText}>
          <Input
            id={id('paid-on')}
            type="date"
            max={today}
            value={value.fromCashSession ? today : value.paidOn}
            disabled={disabled || value.fromCashSession}
            onChange={(e) => onChange({ ...value, paidOn: e.target.value })}
            aria-invalid={paidOnErrorText ? true : undefined}
            aria-describedby={paidOnErrorText ? fieldErrorId(id('paid-on')) : undefined}
            className="tabular-nums"
          />
        </FormField>
      </div>
      {cash ? (
        <div className="flex items-start gap-3">
          <input
            id={id('from-cash')}
            type="checkbox"
            checked={value.fromCashSession}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, fromCashSession: e.target.checked })}
            aria-describedby={id('from-cash-hint')}
            className="mt-0.5 size-5 shrink-0 accent-[var(--color-primary)]"
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            <label htmlFor={id('from-cash')} className="text-sm font-medium text-ink">
              {expensePaymentFieldsCopy.fromCash}
            </label>
            <p id={id('from-cash-hint')} className="text-xs text-muted">
              {expensePaymentFieldsCopy.fromCashHint}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
