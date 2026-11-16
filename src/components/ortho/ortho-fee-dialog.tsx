'use client';
import * as React from 'react';
import { useId, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { centsToAmount } from '@/lib/money/round';
import {
  checkFee,
  feeDraftOf,
  feeSumCents,
  parseFeeAmount,
  setOrthoFee,
  type FeeDraft,
  type OrthoCaseAccount,
  type OrthoFee,
} from '@/lib/ortho/ortho-billing';
import { FormModal } from '@/components/shared/form-modal';
import { FormField } from '@/components/shared/form-field';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/shared/money-input';

export const orthoFeeDialogCopy = {
  title: 'Honorario del caso',
  description:
    'El total y su reparto. Al aceptarlo, la inicial, cada control y el retiro pasan al plan de tratamiento como ítems para cobrarlos con los abonos de siempre.',
  total: 'Honorario total',
  initial: 'Cuota inicial (cementado o entrega de alineadores)',
  perVisit: 'Importe por control',
  visitCount: 'Controles que se cobran',
  retention: 'Retiro y retención',
  sum: (sum: string, total: string) => `El reparto suma ${sum} de ${total}.`,
  sumOk: 'El reparto cuadra con el total.',
  currency: (code: string) => `Importes en ${code}.`,
  submit: 'Guardar honorario',
  genericError: 'No pudimos guardar el honorario. Intenta de nuevo.',
};
const copy = orthoFeeDialogCopy;

/** «Poner/editar honorario» (DX-285). El reparto se comprueba al céntimo antes de enviar; la API lo vuelve a exigir. */
export function OrthoFeeDialog({
  open,
  onOpenChange,
  token,
  patientId,
  caseId,
  fee,
  plannedVisits,
  currency,
  money,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patientId: string;
  caseId: string;
  fee: OrthoFee | null;
  plannedVisits: number;
  /** La moneda del honorario (la del plan ligado o la de la sede del caso). */
  currency: string;
  /** El pintor de importes de la sede del caso (`stamp.money`). */
  money: (amount: number, currency: string) => string;
  onSaved: (account: OrthoCaseAccount) => void;
}) {
  const ids = useId();
  const id = (name: string) => `${ids}-${name}`;
  const [draft, setDraft] = useState<FeeDraft>(() => feeDraftOf(fee, plannedVisits));
  const [fieldError, setFieldError] = useState<{ field?: keyof FeeDraft; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setText = (field: keyof FeeDraft) => (text: string) => setDraft((d) => ({ ...d, [field]: text }));
  const sumCents = feeSumCents(draft, currency);
  const total = parseFeeAmount(draft.total, currency);
  const sumLine =
    sumCents !== null && total !== null && total > 0
      ? checkFee(draft, currency).ok
        ? copy.sumOk
        : copy.sum(money(centsToAmount(sumCents), currency), money(total, currency))
      : null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const checked = checkFee(draft, currency);
    if (!checked.ok) {
      setFieldError({ field: checked.field, message: checked.message });
      return;
    }
    setFieldError(null);
    setSubmitting(true);
    setError(null);
    try {
      const account = await setOrthoFee(token, patientId, caseId, checked.input);
      onOpenChange(false);
      onSaved(account);
    } catch (err) {
      setError(apiErrorMessage(err, copy.genericError));
    } finally {
      setSubmitting(false);
    }
  }

  const errorOf = (field: keyof FeeDraft) => (fieldError?.field === field ? fieldError.message : null);
  const amountInput = (field: keyof FeeDraft, label: string) => (
    <FormField htmlFor={id(field)} label={label} error={errorOf(field)}>
      <MoneyInput
        id={id(field)}
        currency={currency}
        money={money}
        requirePositive={field === 'total'}
        value={draft[field]}
        onValueChange={setText(field)}
      />
    </FormField>
  );

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={copy.submit}
      submitting={submitting}
      error={error ?? (fieldError && !fieldError.field ? fieldError.message : null)}
    >
      <p className="text-sm text-muted">{copy.currency(currency)}</p>
      {amountInput('total', copy.total)}
      {amountInput('initial', copy.initial)}
      <div className="grid gap-4 sm:grid-cols-2">
        {amountInput('perVisit', copy.perVisit)}
        <FormField htmlFor={id('visitCount')} label={copy.visitCount} error={errorOf('visitCount')}>
          <Input
            id={id('visitCount')}
            inputMode="numeric"
            autoComplete="off"
            className="tabular-nums"
            value={draft.visitCount}
            onChange={(e) => setText('visitCount')(e.target.value)}
          />
        </FormField>
      </div>
      {amountInput('retention', copy.retention)}
      {sumLine ? (
        <p aria-live="polite" className="t-data text-sm text-ink" data-testid="ortho-fee-sum">
          {sumLine}
        </p>
      ) : null}
    </FormModal>
  );
}
