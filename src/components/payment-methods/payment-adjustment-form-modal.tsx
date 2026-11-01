'use client';
import * as React from 'react';
import { useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { parseDecimalInput, parseMoneyInput } from '@/lib/format/money';
import {
  createPaymentAdjustment,
  updatePaymentAdjustment,
  type ClinicPaymentMethod,
  type PaymentMethodAdjustment,
} from '@/lib/payments/payment-methods-api';
import {
  ADJUSTMENT_LABEL_MAX,
  PAYMENT_ADJUSTMENT_TYPE_LABELS,
  PAYMENT_ADJUSTMENT_TYPE_OPTIONS,
  type PaymentAdjustmentCalculation,
  type PaymentAdjustmentType,
} from '@/lib/payments/payment-adjustments';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { MoneyInput } from '@/components/shared/money-input';
import { CurrencySelect } from '@/components/shared/currency-select';
import { Callout } from '@/components/ui/callout';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { RadioGroup, RadioOption } from '@/components/ui/radio-group';

export const paymentAdjustmentFormCopy = {
  createTitle: 'Nuevo ajuste por medio de pago',
  editTitle: 'Editar ajuste',
  description:
    'Se calcula sobre el importe de cada abono con ese medio y queda congelado en el abono. Los impuestos y recargos se cobran aparte del tratamiento; los descuentos cuentan como abono.',
  method: 'Medio de pago',
  type: 'Tipo',
  label: 'Etiqueta',
  labelHint: 'Es lo que leen el recibo, la caja y el CSV.',
  labelPlaceholder: 'Por ejemplo, Impuesto 3 %',
  calculation: 'Cálculo',
  percentOption: 'En porcentaje',
  fixedOption: 'Importe fijo',
  percent: 'Porcentaje',
  percentPlaceholder: 'Por ejemplo, 3',
  fixedAmount: 'Importe',
  fixedCurrency: 'Moneda',
  fixedHint: (currency: string) => `Solo se aplica a los abonos en ${currency || 'esa moneda'}.`,
  active: 'Activo',
  activeHint: 'Desactivado, no se aplica a los abonos nuevos. Los ya registrados no cambian.',
  surchargeNotice:
    'En algunos lugares cobrar un recargo por el medio de pago no está permitido. Confirma que puedes hacerlo antes de activarlo.',
  frozenNotice: 'Los abonos ya registrados conservan el ajuste con el que se cobraron.',
  create: 'Crear ajuste',
  save: 'Guardar cambios',
  invalidLabel: `Escribe una etiqueta (hasta ${ADJUSTMENT_LABEL_MAX} caracteres).`,
  methodRequired: 'Elige el medio de pago.',
  percentRange: 'Escribe un porcentaje mayor que 0 y como mucho 100.',
  currencyRequired: 'Elige la moneda del importe.',
  amountPositive: 'Escribe un importe mayor que 0.',
  genericError: 'No pudimos guardar el ajuste. Intenta de nuevo.',
};
const copy = paymentAdjustmentFormCopy;

interface FieldErrors {
  method?: string;
  label?: string;
  percent?: string;
  fixedAmount?: string;
  fixedCurrency?: string;
}

interface PaymentAdjustmentFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  /** Los medios de la clínica (para elegir uno en el alta). */
  methods: ClinicPaymentMethod[];
  /** Con ajuste: edición (su medio no cambia). Sin él: alta. */
  editing?: {
    method: ClinicPaymentMethod;
    adjustment: PaymentMethodAdjustment;
  } | null;
  onSaved: (paymentMethodId: string, adjustment: PaymentMethodAdjustment) => void;
}

/** Texto de un número guardado para el campo («7,5»). */
function amountText(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value).replace('.', ',');
}

/**
 * Alta y edición de un ajuste por medio de pago (DX-516, solo ADMIN): tipo,
 * etiqueta libre, porcentaje o importe fijo con su moneda, y activo. El padre
 * lo monta con una `key` por apertura.
 */
export function PaymentAdjustmentFormModal({
  open,
  onOpenChange,
  token,
  methods,
  editing,
  onSaved,
}: PaymentAdjustmentFormModalProps) {
  const current = editing?.adjustment ?? null;
  const [methodId, setMethodId] = useState(editing?.method.id ?? methods.find((m) => m.active)?.id ?? '');
  const [type, setType] = useState<PaymentAdjustmentType>(current?.type ?? 'TAX');
  const [label, setLabel] = useState(current?.label ?? '');
  const [calculation, setCalculation] = useState<PaymentAdjustmentCalculation>(current?.calculation ?? 'PERCENT');
  const [percent, setPercent] = useState(amountText(current?.percent));
  const [fixedAmount, setFixedAmount] = useState(amountText(current?.fixedAmount));
  const [fixedCurrency, setFixedCurrency] = useState(current?.fixedCurrency ?? '');
  const [active, setActive] = useState(current?.active ?? true);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function validate(): {
    errors: FieldErrors;
    percent?: number;
    fixedAmount?: number;
  } {
    const found: FieldErrors = {};
    if (methodId === '') found.method = copy.methodRequired;
    const trimmed = label.trim();
    if (trimmed === '' || [...trimmed].length > ADJUSTMENT_LABEL_MAX) found.label = copy.invalidLabel;
    if (calculation === 'PERCENT') {
      const parsed = parseDecimalInput(percent, 2);
      if (!parsed.ok) found.percent = parsed.message;
      else if (parsed.value <= 0 || parsed.value > 100) found.percent = copy.percentRange;
      else return { errors: found, percent: parsed.value };
      return { errors: found };
    }
    if (fixedCurrency === '') found.fixedCurrency = copy.currencyRequired;
    const parsed = parseMoneyInput(fixedAmount, fixedCurrency);
    if (!parsed.ok) found.fixedAmount = parsed.message;
    else if (parsed.value <= 0) found.fixedAmount = copy.amountPositive;
    else return { errors: found, fixedAmount: parsed.value };
    return { errors: found };
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const checked = validate();
    setErrors(checked.errors);
    const firstInvalid = (['method', 'label', 'percent', 'fixedAmount', 'fixedCurrency'] as const).find(
      (k) => checked.errors[k],
    );
    if (firstInvalid) {
      document.getElementById(`adj-${firstInvalid}`)?.focus();
      return;
    }
    const body =
      calculation === 'PERCENT'
        ? {
            type,
            label: label.trim(),
            calculation,
            percent: checked.percent,
            fixedAmount: null,
            fixedCurrency: null,
            active,
          }
        : {
            type,
            label: label.trim(),
            calculation,
            percent: null,
            fixedAmount: checked.fixedAmount,
            fixedCurrency,
            active,
          };
    setSubmitting(true);
    try {
      const saved = current
        ? await updatePaymentAdjustment(token, methodId, current.id, body)
        : await createPaymentAdjustment(token, methodId, body);
      onSaved(methodId, saved);
      onOpenChange(false);
    } catch (err) {
      setError(apiErrorMessage(err, copy.genericError));
    } finally {
      setSubmitting(false);
    }
  }

  const clear = (key: keyof FieldErrors) => setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={current ? copy.editTitle : copy.createTitle}
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={current ? copy.save : copy.create}
      submitting={submitting}
      error={error}
      touchTargets
    >
      <FormField htmlFor="adj-method" label={copy.method} error={errors.method}>
        <NativeSelect
          id="adj-method"
          value={methodId}
          disabled={!!current}
          aria-invalid={errors.method ? true : undefined}
          aria-describedby={errors.method ? fieldErrorId('adj-method') : undefined}
          onChange={(e) => {
            setMethodId(e.target.value);
            clear('method');
          }}
        >
          {methodId === '' ? <option value="">—</option> : null}
          {methods.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField htmlFor="adj-type" label={copy.type}>
        <NativeSelect id="adj-type" value={type} onChange={(e) => setType(e.target.value as PaymentAdjustmentType)}>
          {PAYMENT_ADJUSTMENT_TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {PAYMENT_ADJUSTMENT_TYPE_LABELS[t]}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      {type === 'SURCHARGE' ? <Callout tone="warning">{copy.surchargeNotice}</Callout> : null}
      <FormField
        htmlFor="adj-label"
        label={copy.label}
        hint={copy.labelHint}
        hintId="adj-label-hint"
        error={errors.label}
      >
        <Input
          id="adj-label"
          value={label}
          maxLength={ADJUSTMENT_LABEL_MAX}
          placeholder={copy.labelPlaceholder}
          aria-required
          aria-invalid={errors.label ? true : undefined}
          aria-describedby={errors.label ? fieldErrorId('adj-label') : 'adj-label-hint'}
          onChange={(e) => {
            setLabel(e.target.value);
            clear('label');
          }}
        />
      </FormField>
      <RadioGroup
        id="adj-calculation"
        legend={copy.calculation}
        value={calculation}
        onValueChange={(v) => setCalculation(v as PaymentAdjustmentCalculation)}
        optionsClassName="flex-row flex-wrap gap-x-6"
      >
        <RadioOption id="adj-calculation" value="PERCENT" label={copy.percentOption} />
        <RadioOption value="FIXED" label={copy.fixedOption} />
      </RadioGroup>
      {calculation === 'PERCENT' ? (
        <FormField htmlFor="adj-percent" label={copy.percent} error={errors.percent}>
          <Input
            id="adj-percent"
            inputMode="decimal"
            value={percent}
            placeholder={copy.percentPlaceholder}
            aria-invalid={errors.percent ? true : undefined}
            aria-describedby={errors.percent ? fieldErrorId('adj-percent') : undefined}
            onChange={(e) => {
              setPercent(e.target.value);
              clear('percent');
            }}
          />
        </FormField>
      ) : (
        <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <FormField
            htmlFor="adj-fixedAmount"
            label={copy.fixedAmount}
            hint={copy.fixedHint(fixedCurrency)}
            hintId="adj-fixed-hint"
            error={errors.fixedAmount}
          >
            <MoneyInput
              id="adj-fixedAmount"
              value={fixedAmount}
              currency={fixedCurrency}
              requirePositive
              onValueChange={(text) => {
                setFixedAmount(text);
                clear('fixedAmount');
              }}
              aria-invalid={errors.fixedAmount ? true : undefined}
              aria-describedby={errors.fixedAmount ? fieldErrorId('adj-fixedAmount') : 'adj-fixed-hint'}
            />
          </FormField>
          <FormField htmlFor="adj-fixedCurrency" label={copy.fixedCurrency} error={errors.fixedCurrency}>
            <CurrencySelect
              id="adj-fixedCurrency"
              token={token}
              value={fixedCurrency}
              placeholder="—"
              invalid={!!errors.fixedCurrency}
              onChange={(code) => {
                setFixedCurrency(code);
                clear('fixedCurrency');
              }}
            />
          </FormField>
        </div>
      )}
      {current ? (
        <>
          <Checkbox
            id="adj-active"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            label={copy.active}
            description={copy.activeHint}
          />
          <p className="text-xs text-muted">{copy.frozenNotice}</p>
        </>
      ) : null}
    </FormModal>
  );
}
