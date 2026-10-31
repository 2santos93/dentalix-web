'use client';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { FormModal } from '@/components/shared/form-modal';
import { Callout } from '@/components/ui/callout';
import { InlineError } from '@/components/errors/inline-error';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { MoneyInput } from '@/components/shared/money-input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { apiErrorMessage } from '@/lib/api/error-message';
import { formatCurrency } from '@/lib/format/currency';
import { formatCivilDate } from '@/lib/format/date';
import { parseMoneyInput } from '@/lib/format/money';
import { PAYMENT_METHOD_LABELS } from '@/lib/payments/payment-method';
import {
  refundCredit,
  type CreditRefund,
  type RefundMethod,
} from '@/lib/patient-credit/patient-credit-api';
import type { AccountStatementMovement } from '@/lib/account-statement/account-statement-api';
import { listLocations, type ClinicLocation } from '@/lib/locations/locations-api';
import { getActiveLocationId } from '@/lib/locations/location-store';
import { getTokenAllowedLocationIds } from '@/lib/auth/token-role';
import { creditPreviewCopy, type CreditSource } from './credit-balance';
import { CreditPreview } from './credit-preview';

export const REFUND_REASON_MIN = 3;
export const REFUND_REASON_MAX = 500;
/** Tope de abonos de referencia por devolución (el de la API). */
export const REFUND_MAX_PAYMENTS = 20;
const METHODS: RefundMethod[] = ['CASH', 'CARD', 'TRANSFER', 'OTHER'];

const copy = {
  title: 'Devolver saldo a favor',
  description:
    'Se devuelve al paciente y queda un comprobante numerado para firmar. Los abonos no se anulan: la traza contable queda completa. En efectivo sale de tu caja abierta.',
  amount: 'Importe a devolver',
  method: 'Cómo se devuelve',
  reason: 'Motivo',
  reasonHint: `Obligatorio, entre ${REFUND_REASON_MIN} y ${REFUND_REASON_MAX} caracteres.`,
  reasonTooShort: `Escribe el motivo (al menos ${REFUND_REASON_MIN} caracteres).`,
  payments: 'Abonos que se devuelven',
  paymentsHint: 'Marca al menos uno: salen en el comprobante como referencia.',
  paymentsRequired: 'Marca al menos un abono de referencia.',
  paymentsTooMany: `Marca como máximo ${REFUND_MAX_PAYMENTS} abonos de referencia.`,
  noPayments: 'Este plan no tiene abonos vivos que citar.',
  payment: (amount: string, date: string) => `${amount} · ${date}`,
  invalidAmount: 'Escribe un importe mayor que 0.',
  overCredit: (max: string) => `No puede superar el saldo a favor (${max}).`,
  submit: 'Devolver',
  // D1 (QA): el efectivo sale del cajón de UNA sede.
  cashFrom: (name: string) => `El efectivo sale de tu caja en ${name}.`,
  cashNeedsLocation:
    'Elige la sede de la caja de la que sale el efectivo: cámbiala en el selector de sede de arriba.',
  failed: 'No pudimos registrar la devolución.',
};

interface CreditRefundModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  source: CreditSource;
  payments: AccountStatementMovement[];
  planName: (planId: string) => string;
  onDone: (refund: CreditRefund) => void;
}

/**
 * «Devolver» (DX-253): importe, método, motivo obligatorio y abonos de
 * referencia, con la vista previa del saldo a favor que queda. Una
 * Idempotency-Key por cuerpo: reenviar el mismo tras un fallo no duplica.
 */
export function CreditRefundModal({
  open,
  onOpenChange,
  token,
  source,
  payments,
  planName,
  onDone,
}: CreditRefundModalProps) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<RefundMethod>('CASH');
  const [reason, setReason] = useState('');
  // Todos marcados de entrada, salvo que pasen del tope de la API: entonces
  // ninguno (quien devuelve elige cuáles citar).
  const [selected, setSelected] = useState<string[]>(() =>
    payments.length <= REFUND_MAX_PAYMENTS ? payments.map((p) => p.id) : [],
  );
  const [amountError, setAmountError] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const key = useRef<{ body: string; key: string } | null>(null);
  const parsed = parseMoneyInput(amount, source.currency);
  const value = parsed.ok ? parsed.value : 0;
  // D1: la sede activa (la de `X-Location-Id`) y las sedes posibles. Con
  // varias y ninguna elegida, el efectivo no se puede devolver.
  const [locations, setLocations] = useState<ClinicLocation[]>([]);
  const [activeLocationId, setActiveLocationId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    listLocations(token)
      .then((data) => {
        if (cancelled) return;
        setLocations(data ?? []);
        setActiveLocationId(getActiveLocationId());
      })
      .catch(() => {
        /* sin la lista no se nombra la sede; la API decide con su 400 */
      });
    return () => {
      cancelled = true;
    };
  }, [token]);
  const allowed = getTokenAllowedLocationIds(token);
  const usable = locations.filter((l) => l.isActive && (allowed === null || allowed.includes(l.id)));
  const activeLocation = usable.find((l) => l.id === activeLocationId) ?? (usable.length === 1 ? usable[0] : null);
  const cashBlocked = method === 'CASH' && activeLocation === null && usable.length > 1;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    let invalid = false;
    if (!parsed.ok || parsed.value <= 0) {
      setAmountError(parsed.ok || parsed.reason === 'empty' ? copy.invalidAmount : parsed.message);
      invalid = true;
    } else if (Math.round(parsed.value * 100) > Math.round(source.credit * 100)) {
      setAmountError(copy.overCredit(formatCurrency(source.credit, source.currency)));
      invalid = true;
    }
    const trimmed = reason.trim();
    if (trimmed.length < REFUND_REASON_MIN) {
      setReasonError(copy.reasonTooShort);
      invalid = true;
    }
    if (selected.length === 0) {
      setPaymentsError(copy.paymentsRequired);
      invalid = true;
    } else if (selected.length > REFUND_MAX_PAYMENTS) {
      setPaymentsError(copy.paymentsTooMany);
      invalid = true;
    }
    if (invalid || !parsed.ok || cashBlocked) return;
    setError(null);
    const body = {
      amount: parsed.value,
      currency: source.currency,
      method,
      reason: trimmed,
      paymentIds: [...selected].sort(),
    };
    const fingerprint = JSON.stringify(body);
    if (key.current?.body !== fingerprint) {
      key.current = { body: fingerprint, key: crypto.randomUUID() };
    }
    setSubmitting(true);
    try {
      onDone(await refundCredit(token, source.planId, body, key.current.key));
    } catch (err) {
      setError(apiErrorMessage(err, { fallback: copy.failed }));
    } finally {
      setSubmitting(false);
    }
  }

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => (checked ? [...prev, id] : prev.filter((p) => p !== id)));
    setPaymentsError(null);
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={copy.description}
      onSubmit={(e) => void handleSubmit(e)}
      submitLabel={copy.submit}
      submitting={submitting}
      submitDisabled={cashBlocked}
      error={error}
      destructive
    >
      <p className="rounded-lg bg-surface-sunken px-3 py-2 text-sm text-ink tabular-nums">
        {creditPreviewCopy.source(planName(source.planId), formatCurrency(source.credit, source.currency))}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField htmlFor="cr-amount" label={copy.amount} error={amountError}>
          <MoneyInput
            id="cr-amount"
            currency={source.currency}
            requirePositive
            value={amount}
            disabled={submitting}
            onValueChange={(next) => {
              setAmount(next);
              setAmountError(null);
            }}
            aria-invalid={amountError ? true : undefined}
            aria-describedby={amountError ? fieldErrorId('cr-amount') : undefined}
          />
        </FormField>
        <FormField htmlFor="cr-method" label={copy.method}>
          <NativeSelect
            id="cr-method"
            value={method}
            disabled={submitting}
            onChange={(e) => setMethod(e.target.value as RefundMethod)}
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>
      {method === 'CASH' ? (
        cashBlocked ? (
          <Callout tone="warning" role="alert" data-testid="refund-cash-location">
            {copy.cashNeedsLocation}
          </Callout>
        ) : activeLocation ? (
          <p data-testid="refund-cash-location" className="t-label text-muted">
            {copy.cashFrom(activeLocation.name)}
          </p>
        ) : null
      ) : null}
      <FormField
        htmlFor="cr-reason"
        label={copy.reason}
        error={reasonError}
        hint={copy.reasonHint}
        hintId="cr-reason-hint"
      >
        <Textarea
          id="cr-reason"
          rows={3}
          maxLength={REFUND_REASON_MAX}
          value={reason}
          disabled={submitting}
          onChange={(e) => {
            setReason(e.target.value);
            setReasonError(null);
          }}
          aria-invalid={reasonError ? true : undefined}
          aria-describedby={reasonError ? fieldErrorId('cr-reason') : 'cr-reason-hint'}
        />
      </FormField>
      <fieldset className="flex flex-col gap-2" aria-describedby="cr-payments-hint">
        <legend className="t-label text-ink">{copy.payments}</legend>
        {payments.length === 0 ? (
          <p className="text-sm text-muted">{copy.noPayments}</p>
        ) : (
          payments.map((p) => (
            <Checkbox
              key={p.id}
              checked={selected.includes(p.id)}
              disabled={submitting}
              onChange={(e) => toggle(p.id, e.target.checked)}
              label={
                <span className="tabular-nums">
                  {copy.payment(formatCurrency(p.amount, p.currency), formatCivilDate(p.paidOn))}
                </span>
              }
            />
          ))
        )}
        {paymentsError ? (
          <InlineError id="cr-payments-hint">{paymentsError}</InlineError>
        ) : (
          <p id="cr-payments-hint" className="t-caption">
            {copy.paymentsHint}
          </p>
        )}
      </fieldset>
      <CreditPreview
        rows={[
          {
            label: creditPreviewCopy.creditLeft,
            value: formatCurrency(Math.max(0, source.credit - value), source.currency),
          },
        ]}
      />
    </FormModal>
  );
}
