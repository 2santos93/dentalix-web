'use client';
import * as React from 'react';
import { useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { moneyInputText, parseDecimalInput, parseMoneyInput } from '@/lib/format/money';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { readyFormat, useSedeFormat } from '@/lib/locations/use-sede-format';
import {
  PAYMENT_LINK_CONCEPT_LABELS,
  OPENING_BALANCE_CURRENCY_FIXED,
  PAYMENT_REPORT_NOT_PENDING,
  RATE_OVERRIDE_NOT_FOR_OPENING_BALANCE,
  confirmPaymentReport,
  type ConfirmPaymentReportInput,
  type ConfirmedPaymentReport,
  type PaymentReport,
} from '@/lib/payment-links/payment-links-api';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { MoneyInput } from '@/components/shared/money-input';
import { CurrencySelect } from '@/components/shared/currency-select';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { DescriptionItem, DescriptionList } from '@/components/ui/description-list';
import { Input } from '@/components/ui/input';
import {
  EMPTY_METHOD_LINE,
  PaymentMethodSelect,
  PaymentReferenceFields,
  methodFieldsOf,
  paymentMethodFieldsCopy,
  type MethodLineState,
} from '@/components/payments/payment-method-fields';
import { usePaymentMethods } from '@/components/payments/use-payment-methods';
import { useExchangeRates } from '@/components/payments/use-exchange-rates';
import { usePlanBalance } from '@/components/payments/use-plan-balance';
import { PaymentRatePreview, type PreviewPlanBalance } from '@/components/payments/payment-rate-preview';

export const confirmReportCopy = {
  title: 'Confirmar pago reportado',
  description:
    'Revisa lo que reportó el paciente contra lo que llegó de verdad. Si algo no coincide, corrígelo: el abono se registra con lo corregido y cada cambio queda en la auditoría.',
  reported: 'Lo que reportó el paciente',
  patient: 'Paciente',
  requested: 'Se pidió',
  method: 'Medio',
  amount: 'Importe',
  reference: 'Referencia',
  paidOn: 'Fecha del pago',
  proof: 'Comprobante',
  proofNone: 'Sin comprobante',
  viewProof: 'Ver comprobante',
  note: 'Nota del paciente',
  noReference: 'Sin referencia',
  corrections: 'Lo que se registra',
  amountLabel: 'Importe recibido',
  currencyLabel: 'Moneda',
  currencyLocked: 'Un saldo migrado se cobra solo en su moneda.',
  paidOnLabel: 'Fecha del pago',
  paidOnHint: 'La tasa de cambio es la de este día.',
  rateOverride: 'Corregir la tasa de cambio',
  rateOverrideHint: 'Solo si la tasa del día no es la que se aplicó al pago. Queda en la auditoría con el motivo.',
  rateValue: (currency: string, base: string) => `Tasa: ${currency} por 1 ${base}`,
  rateReason: 'Motivo de la tasa corregida',
  rateInvalid: 'Escribe una tasa mayor que 0, con hasta 8 decimales.',
  rateReasonMissing: 'Escribe el motivo de la tasa corregida.',
  amountRequired: 'Escribe el importe recibido.',
  amountPositive: 'El importe tiene que ser mayor que 0.',
  dateRequired: 'Escribe la fecha del pago.',
  submit: 'Confirmar pago',
  submitDuplicate: 'Confirmar igualmente',
  genericError: 'No pudimos confirmar el pago. Intenta de nuevo.',
};
const copy = confirmReportCopy;

interface ConfirmPaymentReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  report: PaymentReport;
  /** Abre el comprobante que envió el paciente. */
  onViewProof: (reportId: string) => void;
  onConfirmed: (result: ConfirmedPaymentReport) => void;
  /** 409 `PAYMENT_REPORT_NOT_PENDING`: otra persona ya lo decidió. */
  onStale: () => void;
}

/**
 * DX-569: confirmar un pago reportado. Arriba, lo que reportó el paciente;
 * abajo, lo que se registra, precargado con lo reportado y corregible (medio,
 * referencia, importe, moneda, fecha y, con motivo, la tasa). Reutiliza las
 * piezas del cobro: el selector de medios y la referencia con su aviso de
 * repetida (409 → motivo y reintento), y la vista previa de la tasa cuando la
 * moneda no es la de lo que se pidió. El padre lo monta con `key` por reporte.
 */
export function ConfirmPaymentReportModal({
  open,
  onOpenChange,
  token,
  report,
  onViewProof,
  onConfirmed,
  onStale,
}: ConfirmPaymentReportModalProps) {
  const stamp = useSedeStamp(token, [report.locationId]);
  const fmt = readyFormat(useSedeFormat(token));
  const methods = usePaymentMethods(token, open);
  const [line, setLine] = useState<MethodLineState>({
    ...EMPTY_METHOD_LINE,
    paymentMethodId: report.paymentMethodId,
    reference: report.reference ?? '',
  });
  const fields = methodFieldsOf(methods, line, setLine);
  const [amountText, setAmountText] = useState(moneyInputText(report.amount));
  const [currency, setCurrency] = useState(report.currency);
  const [paidOn, setPaidOn] = useState<string | null>(report.paidOn);
  const [overrideOn, setOverrideOn] = useState(false);
  const [rateText, setRateText] = useState('');
  const [rateReason, setRateReason] = useState('');
  const [errors, setErrors] = useState<{
    amount?: string;
    currency?: string;
    paidOn?: string;
    rate?: string;
    rateReason?: string;
  }>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isOpening = report.link.openingBalanceId !== null;
  const linkCurrency = report.link.currency;
  const otherCurrency = currency !== linkCurrency;
  const rates = useExchangeRates(token, paidOn ?? '', open && otherCurrency, [currency, linkCurrency]);
  // La API solo admite corregir la tasa de un par con la moneda base de las tasas
  // (la que da la API, `rates.base`), y nunca en un saldo migrado.
  const base = rates.status === 'ready' ? rates.rates.base : null;
  const canOverrideRate = !isOpening && otherCurrency && base !== null && (currency === base || linkCurrency === base);
  const quoted = currency === base ? linkCurrency : currency;
  const balance = usePlanBalance(token, report.link.treatmentPlanId, open && otherCurrency);
  const previewBalance: PreviewPlanBalance =
    balance.status === 'ready'
      ? {
          balance: balance.balance.balance,
          paymentsWithoutRate: balance.balance.paymentsWithoutRate.length,
          rateProviderTimedOut: balance.balance.rateProviderTimedOut,
        }
      : balance.status === 'error'
        ? 'error'
        : 'loading';
  const parsedAmount = parseMoneyInput(amountText, currency);
  const previewAmount = parsedAmount.ok && parsedAmount.value > 0 ? parsedAmount.value : null;

  const money = (amount: number, code: string) => stamp.money(amount, code, report.locationId);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const next: typeof errors = {};
    if (amountText.trim() === '') next.amount = copy.amountRequired;
    else if (!parsedAmount.ok) next.amount = parsedAmount.message;
    else if (parsedAmount.value <= 0) next.amount = copy.amountPositive;
    if (!paidOn) next.paidOn = copy.dateRequired;
    let rateOverride: number | null = null;
    if (canOverrideRate && overrideOn) {
      const parsed = parseDecimalInput(rateText, 8);
      if (!parsed.ok || parsed.value <= 0) next.rate = copy.rateInvalid;
      else rateOverride = parsed.value;
      if (rateReason.trim() === '') next.rateReason = copy.rateReasonMissing;
    }
    setErrors(next);
    const firstInvalid = (['amount', 'paidOn', 'rate', 'rateReason'] as const).find((k) => next[k]);
    if (firstInvalid) {
      document.getElementById(`cr-${firstInvalid}`)?.focus();
      return;
    }
    if (!fields.validate({ requireMethod: true }) || !parsedAmount.ok || !paidOn) return;

    const body: ConfirmPaymentReportInput = {};
    if (parsedAmount.value !== report.amount) body.amount = parsedAmount.value;
    if (currency !== report.currency) body.currency = currency;
    if (fields.paymentMethodId !== report.paymentMethodId) body.paymentMethodId = fields.paymentMethodId;
    const reference = fields.reference.trim();
    if (reference !== (report.reference ?? '')) body.reference = reference === '' ? null : reference;
    if (paidOn !== report.paidOn) body.paidOn = paidOn;
    if (rateOverride !== null) {
      body.rateOverride = rateOverride;
      body.rateOverrideReason = rateReason.trim();
    }
    const duplicateReason = fields.body().duplicateReferenceReason;
    if (duplicateReason) body.duplicateReferenceReason = duplicateReason;

    setSubmitting(true);
    try {
      onConfirmed(await confirmPaymentReport(token, report.id, body));
    } catch (err) {
      if (fields.catchDuplicate(err)) return;
      if (err instanceof ApiError && err.code === PAYMENT_REPORT_NOT_PENDING) {
        onStale();
        return;
      }
      // Un saldo migrado se abona en su moneda y sin tasa: se vuelve a ella y el aviso va en el campo.
      if (
        err instanceof ApiError &&
        (err.code === OPENING_BALANCE_CURRENCY_FIXED || err.code === RATE_OVERRIDE_NOT_FOR_OPENING_BALANCE)
      ) {
        setCurrency(linkCurrency);
        setOverrideOn(false);
        setErrors((p) => ({ ...p, currency: apiErrorMessage(err, copy.genericError) }));
        document.getElementById('cr-currency')?.focus();
        return;
      }
      setError(apiErrorMessage(err, copy.genericError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={fields.duplicate ? copy.submitDuplicate : copy.submit}
      submitting={submitting}
      error={error}
      size="lg"
      touchTargets
    >
      <SedeStampNote stamp={stamp} />
      <section aria-labelledby="cr-reported" className="flex flex-col gap-2 rounded-lg bg-surface-sunken px-3 py-3">
        <h3 id="cr-reported" className="t-label text-ink">
          {copy.reported}
        </h3>
        <DescriptionList columns={2}>
          <DescriptionItem label={copy.patient}>{report.patientName}</DescriptionItem>
          <DescriptionItem label={copy.requested} numeric>
            {`${PAYMENT_LINK_CONCEPT_LABELS[report.link.concept]} · ${money(report.link.amount, report.link.currency)}`}
          </DescriptionItem>
          <DescriptionItem label={copy.method}>{report.paymentMethodName}</DescriptionItem>
          <DescriptionItem label={copy.amount} numeric>
            {money(report.amount, report.currency)}
          </DescriptionItem>
          <DescriptionItem label={copy.reference}>
            {report.reference ? <span className="font-mono">{report.reference}</span> : copy.noReference}
          </DescriptionItem>
          <DescriptionItem label={copy.paidOn} numeric>
            {stamp.civilDate(report.paidOn, report.locationId)}
          </DescriptionItem>
          <DescriptionItem label={copy.proof}>
            {report.proof ? (
              <Button type="button" variant="link" className="h-auto p-0" onClick={() => onViewProof(report.id)}>
                {copy.viewProof}
              </Button>
            ) : (
              copy.proofNone
            )}
          </DescriptionItem>
          {report.note ? (
            <DescriptionItem label={copy.note} wide>
              <span className="whitespace-pre-line">{report.note}</span>
            </DescriptionItem>
          ) : null}
        </DescriptionList>
      </section>

      <h3 className="t-label text-ink">{copy.corrections}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField htmlFor="cr-amount" label={copy.amountLabel} error={errors.amount ?? null}>
          <MoneyInput
            id="cr-amount"
            value={amountText}
            currency={currency}
            requirePositive
            money={money}
            disabled={submitting}
            aria-invalid={errors.amount ? true : undefined}
            onValueChange={(text) => {
              setAmountText(text);
              setErrors((p) => ({ ...p, amount: undefined }));
            }}
          />
        </FormField>
        <FormField
          htmlFor="cr-currency"
          label={copy.currencyLabel}
          hint={isOpening ? copy.currencyLocked : undefined}
          error={errors.currency ?? null}
        >
          <CurrencySelect
            id="cr-currency"
            token={token}
            value={currency}
            disabled={isOpening || submitting}
            invalid={!!errors.currency}
            onChange={(code) => {
              setCurrency(code);
              setOverrideOn(false);
              setErrors((p) => ({ ...p, currency: undefined }));
            }}
          />
        </FormField>
      </div>
      {otherCurrency && report.link.treatmentPlanId ? (
        <PaymentRatePreview
          state={rates}
          amount={previewAmount}
          paymentCurrency={currency}
          planCurrency={linkCurrency}
          planBalance={previewBalance}
          onRetryBalance={() => undefined}
          date={paidOn ?? ''}
          fmt={fmt}
        />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <PaymentMethodSelect fields={fields} id="cr-method" label={paymentMethodFieldsCopy.method} disabled={submitting} />
        <FormField htmlFor="cr-paidOn" label={copy.paidOnLabel} hint={copy.paidOnHint} error={errors.paidOn ?? null}>
          <DatePicker
            id="cr-paidOn"
            value={paidOn}
            disabled={submitting}
            aria-invalid={errors.paidOn ? true : undefined}
            onChange={(next) => {
              setPaidOn(next);
              setErrors((p) => ({ ...p, paidOn: undefined }));
            }}
          />
        </FormField>
      </div>
      <PaymentReferenceFields fields={fields} idPrefix="cr" disabled={submitting} />
      {canOverrideRate ? (
        <div className="flex flex-col gap-3">
          <Checkbox
            id="cr-rate-override"
            checked={overrideOn}
            disabled={submitting}
            onChange={(e) => setOverrideOn(e.target.checked)}
            label={copy.rateOverride}
            description={copy.rateOverrideHint}
          />
          {overrideOn ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField htmlFor="cr-rate" label={copy.rateValue(quoted, base ?? '')} error={errors.rate ?? null}>
                <Input
                  id="cr-rate"
                  inputMode="decimal"
                  autoComplete="off"
                  value={rateText}
                  disabled={submitting}
                  aria-invalid={errors.rate ? true : undefined}
                  aria-describedby={errors.rate ? fieldErrorId('cr-rate') : undefined}
                  onChange={(e) => {
                    setRateText(e.target.value);
                    setErrors((p) => ({ ...p, rate: undefined }));
                  }}
                  className="tabular-nums"
                />
              </FormField>
              <FormField htmlFor="cr-rateReason" label={copy.rateReason} error={errors.rateReason ?? null}>
                <Input
                  id="cr-rateReason"
                  value={rateReason}
                  maxLength={280}
                  disabled={submitting}
                  aria-invalid={errors.rateReason ? true : undefined}
                  onChange={(e) => {
                    setRateReason(e.target.value);
                    setErrors((p) => ({ ...p, rateReason: undefined }));
                  }}
                />
              </FormField>
            </div>
          ) : null}
        </div>
      ) : null}
    </FormModal>
  );
}
