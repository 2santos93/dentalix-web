'use client';
import * as React from 'react';
import { useId, useMemo, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  COMMISSION_PAYMENT_LIMITS,
  payCommissionSettlement,
  payableCurrencies,
  pendingLinesOf,
  sumAmounts,
  type CommissionLine,
  type CommissionPayment,
  type CommissionSettlement,
} from '@/lib/commissions/commissions-api';
import { getActiveLocationId } from '@/lib/locations/location-store';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHOD_OPTIONS } from '@/lib/payments/payment-method';
import type { PaymentMethod } from '@/lib/payments/payments-api';
import { useExpenseLocations } from '@/components/expenses/use-expense-locations';
import { useExpenseToday } from '@/components/expenses/use-expense-today';
import { FieldError } from '@/components/errors/field-error';
import { InlineError } from '@/components/errors/inline-error';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { FormModal } from '@/components/shared/form-modal';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { cn } from '@/lib/utils';

export const commissionPayDialogCopy = {
  title: 'Registrar pago',
  description:
    'Se paga una moneda cada vez, sin convertir: el importe es la suma de las líneas marcadas. Queda como gasto de la sede, en la categoría «Honorarios».',
  currency: 'Moneda',
  lines: 'Líneas que se pagan',
  linesHint: 'Todas las pendientes van marcadas. Los ajustes negativos se descuentan del pago.',
  adjustment: 'Ajuste',
  tooth: (t: string) => `Diente ${t}`,
  patientUnknown: 'Paciente sin nombre',
  total: 'Total del pago',
  pendingOf: (amount: string) => `Pendiente en esta moneda: ${amount}`,
  paidOn: 'Fecha del pago',
  method: 'Medio de pago',
  reference: 'Referencia',
  referenceHint: 'Nº de transferencia, de cheque… (opcional).',
  location: 'Sede del gasto',
  locationHint: 'La sede de cuya caja o cuenta sale el dinero.',
  locationsError: 'Sedes sin cargar',
  fromCash: 'Sale de mi caja',
  fromCashHint: 'Sale del cajón de tu caja abierta en esa sede y baja su efectivo esperado. Solo con fecha de hoy.',
  submit: 'Registrar pago',
  nothingSelected: 'Marca al menos una línea.',
  notPositive: 'El total tiene que ser mayor que 0: marca alguna línea positiva.',
  exceeds: (pending: string) =>
    `El pago no puede superar lo pendiente (${pending}): marca también los ajustes negativos.`,
  paidOnRequired: 'Elige la fecha del pago.',
  paidOnFuture: 'La fecha del pago no puede ser futura.',
  genericError: 'No pudimos registrar el pago. Intenta de nuevo.',
  nothingPending: 'No queda nada pendiente de pagar en esta liquidación.',
};

const copy = commissionPayDialogCopy;

interface CommissionPayDialogProps {
  token: string;
  settlement: CommissionSettlement;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPaid: (payment: CommissionPayment) => void;
}

function lineLabel(l: CommissionLine): string {
  const what = [l.catalogLabel, copy.tooth(l.toothNumber)].join(' · ');
  return l.kind === 'ADJUSTMENT' ? `${copy.adjustment}: ${what}` : what;
}

/**
 * «Registrar pago» de una liquidación (DX-464). Una moneda por pago; las
 * líneas pendientes de esa moneda, todas marcadas (también los ajustes
 * negativos, que se descuentan); el total se suma en vivo en céntimos. La
 * fecha es hoy en la sede del gasto; «Sale de mi caja» solo con efectivo.
 */
export function CommissionPayDialog({ token, settlement, open, onOpenChange, onPaid }: CommissionPayDialogProps) {
  const ids = useId();
  const id = (suffix: string) => `${ids}-${suffix}`;
  const currencies = payableCurrencies(settlement.payment);
  const [currency, setCurrency] = useState<string>(currencies[0]?.currency ?? '');
  const pending = useMemo(() => pendingLinesOf(settlement, currency), [settlement, currency]);
  // null = todas las pendientes (el estado por defecto, también al cambiar de moneda).
  const [selected, setSelected] = useState<ReadonlySet<string> | null>(null);
  const chosen = selected ?? new Set(pending.map((l) => l.id!));
  const [method, setMethod] = useState<PaymentMethod>('TRANSFER');
  const [paidOnChoice, setPaidOn] = useState<string | null>(null);
  const [reference, setReference] = useState('');
  const [fromCash, setFromCash] = useState(false);
  const sedes = useExpenseLocations(token);
  const activeLocations = sedes.locations.filter((l) => l.isActive);
  const [locationChoice, setLocationId] = useState<string | null>(null);
  const defaultLocationId =
    activeLocations.find((l) => l.id === getActiveLocationId())?.id ?? activeLocations[0]?.id ?? null;
  const locationId = locationChoice ?? defaultLocationId;
  const { today, error: zoneError, retry: retryZone } = useExpenseToday(token, locationId, open);
  const paidOn = fromCash ? today : (paidOnChoice ?? today);
  const stamp = useSedeStamp(token, [locationId]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const state = currencies.find((c) => c.currency === currency) ?? null;
  const chosenLines = pending.filter((l) => chosen.has(l.id!));
  const total = sumAmounts(chosenLines.map((l) => l.amount));
  const money = (amount: number) => stamp.money(amount, currency, locationId);

  const linesError =
    chosenLines.length === 0
      ? copy.nothingSelected
      : total <= 0
        ? copy.notPositive
        : state && total > state.pending
          ? copy.exceeds(money(state.pending))
          : null;
  const paidOnError = fromCash || !today ? null : !paidOn ? copy.paidOnRequired : paidOn > today ? copy.paidOnFuture : null;

  function toggle(lineId: string, checked: boolean) {
    const next = new Set(chosen);
    if (checked) next.add(lineId);
    else next.delete(lineId);
    setSelected(next);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setShowErrors(true);
    if (linesError || paidOnError || !paidOn || !locationId) return;
    setSubmitting(true);
    setError(null);
    try {
      const ref = reference.trim();
      const payment = await payCommissionSettlement(token, settlement.id, {
        currency,
        lineIds: chosenLines.map((l) => l.id!),
        paidOn,
        method: fromCash ? 'CASH' : method,
        ...(ref ? { reference: ref } : {}),
        locationId,
        fromCashSession: fromCash,
      });
      onPaid(payment);
    } catch (err) {
      setError(apiErrorMessage(err, copy.genericError));
    } finally {
      setSubmitting(false);
    }
  }

  const nothing = currencies.length === 0;

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={copy.description}
      onSubmit={(e) => void handleSubmit(e)}
      submitLabel={copy.submit}
      submitting={submitting}
      submitDisabled={nothing || !locationId || !today}
      error={error ?? (zoneError && !nothing ? zoneError : null)}
      errorRetry={zoneError ? { label: 'Reintentar', onRetry: retryZone } : null}
      touchTargets
      size="lg"
    >
      {nothing ? (
        <p className="text-sm text-muted">{copy.nothingPending}</p>
      ) : (
        <>
          {currencies.length > 1 ? (
            <FormField htmlFor={id('currency')} label={copy.currency} className="sm:w-48">
              <NativeSelect
                id={id('currency')}
                value={currency}
                disabled={submitting}
                onChange={(e) => {
                  setCurrency(e.target.value);
                  setSelected(null);
                }}
              >
                {currencies.map((c) => (
                  <option key={c.currency} value={c.currency}>
                    {c.currency}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          ) : null}

          <fieldset className="flex flex-col gap-2" aria-describedby={showErrors && linesError ? fieldErrorId(id('lines')) : id('lines-hint')}>
            <legend className="text-sm font-medium text-ink">{copy.lines}</legend>
            <p id={id('lines-hint')} className="text-xs text-muted">
              {copy.linesHint}
            </p>
            <ul className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border">
              {pending.map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-3 px-3 py-1">
                  <Checkbox
                    id={id(`line-${l.id}`)}
                    checked={chosen.has(l.id!)}
                    disabled={submitting}
                    onChange={(e) => toggle(l.id!, e.target.checked)}
                    label={<span className="[overflow-wrap:anywhere]">{lineLabel(l)}</span>}
                    description={l.patient.name ?? copy.patientUnknown}
                    className="min-w-0 flex-1"
                  />
                  <span
                    className={cn(
                      'shrink-0 pt-2.5 text-sm font-medium tabular-nums',
                      l.amount < 0 && 'text-danger-text',
                    )}
                  >
                    {money(l.amount)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-surface-sunken px-3 py-2">
              <span className="text-sm text-muted">
                {state ? copy.pendingOf(money(state.pending)) : null}
              </span>
              <span className="flex items-baseline gap-2">
                <span className="text-sm text-muted">{copy.total}</span>
                <output aria-live="polite" className="text-base font-semibold tabular-nums text-ink" data-testid="commission-pay-total">
                  {money(total)}
                </output>
              </span>
            </div>
            {showErrors && linesError ? (
              <InlineError id={fieldErrorId(id('lines'))}>{linesError}</InlineError>
            ) : null}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            {sedes.failed ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink">{copy.location}</span>
                <FieldError label={copy.locationsError} onRetry={sedes.reload} className="h-10" />
              </div>
            ) : (
              <FormField htmlFor={id('location')} label={copy.location} hint={copy.locationHint}>
                <NativeSelect
                  id={id('location')}
                  value={locationId ?? ''}
                  disabled={submitting || !sedes.loaded}
                  onChange={(e) => {
                    setLocationId(e.target.value);
                    setPaidOn(null);
                  }}
                >
                  {activeLocations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
            )}
            <FormField htmlFor={id('method')} label={copy.method}>
              <NativeSelect
                id={id('method')}
                value={fromCash ? 'CASH' : method}
                disabled={submitting}
                onChange={(e) => {
                  const next = e.target.value as PaymentMethod;
                  setMethod(next);
                  if (next !== 'CASH') setFromCash(false);
                }}
              >
                {PAYMENT_METHOD_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField htmlFor={id('paid-on')} label={copy.paidOn} error={showErrors ? paidOnError : null}>
              <DatePicker
                id={id('paid-on')}
                name={id('paid-on')}
                max={today ?? undefined}
                value={paidOn ?? null}
                disabled={submitting || fromCash || !today}
                onChange={(value) => setPaidOn(value ?? '')}
                aria-invalid={showErrors && paidOnError ? true : undefined}
              />
            </FormField>
            <FormField htmlFor={id('reference')} label={copy.reference} hint={copy.referenceHint}>
              <Input
                id={id('reference')}
                value={reference}
                maxLength={COMMISSION_PAYMENT_LIMITS.referenceMax}
                disabled={submitting}
                onChange={(e) => setReference(e.target.value)}
                autoComplete="off"
              />
            </FormField>
          </div>
          {(fromCash ? 'CASH' : method) === 'CASH' ? (
            <Checkbox
              id={id('from-cash')}
              checked={fromCash}
              disabled={submitting}
              onChange={(e) => setFromCash(e.target.checked)}
              label={copy.fromCash}
              description={copy.fromCashHint}
            />
          ) : null}
        </>
      )}
    </FormModal>
  );
}
