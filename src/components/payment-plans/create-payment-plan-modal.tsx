'use client';
import * as React from 'react';
import { useState } from 'react';
import { createPaymentPlan, type Periodicity } from '@/lib/payment-plans/payment-plan-api';
import { paymentPlanErrorMessage } from '@/lib/payments/payment-errors';
import { formatCurrency } from '@/lib/format/currency';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { NativeSelect } from '@/components/ui/native-select';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { MoneyInput } from '@/components/shared/money-input';
import { moneyInputText, parseMoneyInput } from '@/lib/format/money';
import { FormModal } from '@/components/shared/form-modal';

// Copy como constantes (i18n-ready). Los textos son los que ya tenía el modal
// de «Plan de pagos» del plan de tratamiento, del que sale este componente.
const copy = {
  title: 'Crear plan de pagos',
  installmentsCount: 'N.º de cuotas',
  periodicity: 'Periodicidad',
  startDate: 'Fecha de inicio',
  downPayment: 'Pie (opcional)',
  totalField: 'Total a financiar',
  submit: 'Crear',
  financedPreview: (financed: string, per: string) => `Financiado: ${financed} · Cuota: ${per}`,
  invalidCount: 'El número de cuotas debe ser un entero entre 1 y 600.',
  invalidTotal: 'El total a financiar debe ser mayor que 0.',
  invalidDownPayment: 'El pie no puede ser negativo ni mayor que el total.',
  missingStartDate: 'La fecha de inicio es obligatoria.',
};

const PERIODICITY_OPTIONS: { value: Periodicity; label: string }[] = [
  { value: 'MONTHLY', label: 'Mensual' },
  { value: 'BIWEEKLY', label: 'Quincenal' },
  { value: 'WEEKLY', label: 'Semanal' },
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function todayLocalDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** El plan de tratamiento al que se le crea el calendario de cuotas. */
export interface PaymentPlanTarget {
  id: string;
  currency: string;
  /** Facturable del plan: el total a financiar que se propone. */
  billable: number;
}

interface FormState {
  installmentsCount: string;
  periodicity: Periodicity;
  startDate: string;
  downPayment: string;
  /** `null` = el facturable del plan elegido (cambia si cambia el plan). */
  total: string | null;
}

function initialForm(): FormState {
  return {
    installmentsCount: '12',
    periodicity: 'MONTHLY',
    startDate: todayLocalDateString(),
    downPayment: '0',
    total: null,
  };
}

interface CreatePaymentPlanModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  /** `null` mientras no haya un plan elegido: no se pintan los campos ni se puede crear. */
  plan: PaymentPlanTarget | null;
  /** Tras crear: quien abre el modal recarga sus datos y lo cierra. */
  onCreated: () => void | Promise<void>;
  /**
   * DX-489: cómo se pinta un importe en la vista previa, para que salga con el
   * formato de la pantalla que abre el modal (el plan de tratamiento usa el de
   * la sede). Por defecto, `formatCurrency` (estado de cuenta).
   */
  money?: (amount: number, currency: string) => string;
  /** Campos previos al formulario (p. ej. el selector de plan del estado de cuenta). */
  children?: React.ReactNode;
}

/**
 * «Crear plan de pagos» (calendario de cuotas de un plan de tratamiento). Lo
 * usan el plan de tratamiento (`PaymentPlanSection`, un plan fijo) y el estado
 * de cuenta (DX-067, con el selector de plan en `children`). Cada vez que se
 * abre empieza con los valores por defecto; al cambiar de plan, el total vuelve
 * al facturable del plan nuevo. Los errores de la API salen en español.
 */
export function CreatePaymentPlanModal({
  open,
  onOpenChange,
  token,
  plan,
  onCreated,
  money = formatCurrency,
  children,
}: CreatePaymentPlanModalProps) {
  const [form, setForm] = useState<FormState>(initialForm);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ downPayment?: string; total?: string }>({});

  // Ajuste durante el render (patrón de React para "estado que depende de una
  // prop"): al abrir se empieza de cero, y al cambiar de plan el total vuelve
  // a su facturable.
  const [prevOpen, setPrevOpen] = useState(open);
  const [prevPlanId, setPrevPlanId] = useState(plan?.id ?? null);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setForm(initialForm());
      setError(null);
      setFieldErrors({});
    }
  }
  if ((plan?.id ?? null) !== prevPlanId) {
    setPrevPlanId(plan?.id ?? null);
    setForm((f) => ({ ...f, total: null }));
  }

  const currency = plan?.currency ?? '';
  const totalField = form.total ?? (plan ? moneyInputText(plan.billable) : '');
  // DX-241: la lectura común de los campos de dinero, con los decimales de la
  // moneda del plan. El pie vacío es 0.
  const parsedTotal = parseMoneyInput(totalField, currency);
  const parsedPie = form.downPayment.trim() === '' ? null : parseMoneyInput(form.downPayment, currency);
  const total = parsedTotal.ok ? parsedTotal.value : null;
  const pie = parsedPie === null ? 0 : parsedPie.ok ? parsedPie.value : null;

  function patch(next: Partial<FormState>) {
    setForm((f) => ({ ...f, ...next }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!plan) return;
    setError(null);
    const count = Number(form.installmentsCount);
    const nextFieldErrors = {
      total: !parsedTotal.ok && parsedTotal.reason !== 'empty' ? parsedTotal.message : undefined,
      downPayment: parsedPie && !parsedPie.ok ? parsedPie.message : undefined,
    };
    setFieldErrors(nextFieldErrors);
    if (nextFieldErrors.total || nextFieldErrors.downPayment || pie === null) return;
    if (!Number.isInteger(count) || count < 1 || count > 600) {
      setError(copy.invalidCount);
      return;
    }
    if (total === null || total <= 0) {
      setError(copy.invalidTotal);
      return;
    }
    if (pie > total) {
      setError(copy.invalidDownPayment);
      return;
    }
    if (!form.startDate) {
      setError(copy.missingStartDate);
      return;
    }
    setCreating(true);
    try {
      await createPaymentPlan(token, plan.id, {
        installmentsCount: count,
        periodicity: form.periodicity,
        startDate: new Date(form.startDate).toISOString(),
        downPayment: pie,
        totalToFinance: total,
      });
      await onCreated();
    } catch (err) {
      setError(paymentPlanErrorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  // Vista previa de la cuota (solo UX; el backend reparte de verdad).
  const previewFinanced = round2(Math.max((total ?? 0) - (pie ?? 0), 0));
  const count = Number(form.installmentsCount);
  const previewPer = count >= 1 ? round2(previewFinanced / count) : 0;

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      onSubmit={handleSubmit}
      submitLabel={copy.submit}
      submitting={creating}
      submitDisabled={plan === null}
      error={error}
      size="lg"
    >
      {children}
      {/* Sin plan elegido (cargando, o ninguno disponible) no hay nada que financiar. */}
      {plan ? (
        <>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField htmlFor="pp-count" label={copy.installmentsCount}>
            <Input
              id="pp-count"
              type="number"
              inputMode="numeric"
              min={1}
              max={600}
              step="1"
              value={form.installmentsCount}
              onChange={(e) => patch({ installmentsCount: e.target.value })}
            />
          </FormField>
          <FormField htmlFor="pp-periodicity" label={copy.periodicity}>
            <NativeSelect
              id="pp-periodicity"
              value={form.periodicity}
              onChange={(e) => patch({ periodicity: e.target.value as Periodicity })}
            >
              {PERIODICITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField htmlFor="pp-start" label={copy.startDate}>
            <DatePicker
              id="pp-start"
              name="pp-start"
              value={form.startDate || null}
              onChange={(next) => patch({ startDate: next ?? '' })}
            />
          </FormField>
          <FormField htmlFor="pp-down" label={copy.downPayment} error={fieldErrors.downPayment}>
            <MoneyInput
              id="pp-down"
              currency={currency}
              value={form.downPayment}
              onValueChange={(downPayment) => {
                patch({ downPayment });
                setFieldErrors((f) => ({ ...f, downPayment: undefined }));
              }}
              aria-invalid={fieldErrors.downPayment ? true : undefined}
              aria-describedby={fieldErrors.downPayment ? fieldErrorId('pp-down') : undefined}
            />
          </FormField>
        </div>
        <FormField htmlFor="pp-total" label={copy.totalField} error={fieldErrors.total}>
          <MoneyInput
            id="pp-total"
            currency={currency}
            requirePositive
            value={totalField}
            onValueChange={(text) => {
              patch({ total: text });
              setFieldErrors((f) => ({ ...f, total: undefined }));
            }}
            aria-invalid={fieldErrors.total ? true : undefined}
            aria-describedby={fieldErrors.total ? fieldErrorId('pp-total') : undefined}
          />
        </FormField>
        <p className="text-sm text-muted tabular-nums">
          {copy.financedPreview(
            money(previewFinanced, currency),
            money(previewPer, currency),
          )}
        </p>
        </>
      ) : null}
    </FormModal>
  );
}
