'use client';
import * as React from 'react';
import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { Ban, Receipt, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/api-error';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  chargeCancellationFee,
  getCancellationFee,
  waiveCancellationFee,
  type CancellationFeeView,
} from '@/lib/cancellations/cancellation-fee-api';
import { formatCurrency } from '@/lib/format/currency';
import { moneyInputText, parseMoneyInput } from '@/lib/format/money';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { MoneyInput } from '@/components/shared/money-input';
import { FieldError } from '@/components/errors/field-error';
import { Button } from '@/components/ui/button';
import { FeeReasonModal, VoidCancellationFeeModal, feeReasonCopy, voidFeeCopy } from './fee-reason-modal';

export const cancellationFeeCopy = {
  heading: 'Cargo por inasistencia o cancelación tardía',
  loading: 'Cargando el cargo…',
  loadError: 'Cargo sin cargar',
  suggested: (amount: string, version: number) =>
    `Importe sugerido: ${amount} (política comunicada, versión ${version}).`,
  readOnly: 'Solo un administrador (o recepción, si la política de la sede lo permite) puede generarlo o condonarlo.',
  charge: 'Generar cargo',
  waive: 'Condonar',
  charged: (amount: string) => `Cargo generado: ${amount}.`,
  chargedHint: 'Está en el plan «Cargos administrativos» y se cobra con un abono desde el estado de cuenta.',
  goToStatement: 'Cobrar en el estado de cuenta',
  removed: (amount: string) => `Cargo anulado: ${amount}.`,
  removedHint: 'Se quitó el ítem del plan «Cargos administrativos»: no hay nada que cobrar.',
  voided: (amount: string) => `Cargo anulado: ${amount}.`,
  voidedReason: (reason: string) => `Motivo: ${reason}`,
  mismatch: (itemAmount: string, amount: string) =>
    `El ítem del plan cobra ${itemAmount}, no lo que dice el cargo (${amount}). Se cambió por fuera de este flujo: revísalo antes de cobrar.`,
  voidAction: voidFeeCopy.action,
  waived: 'Cargo condonado.',
  waivedReason: (reason: string) => `Motivo: ${reason}`,
  by: (name: string) => `Por ${name}.`,
  chargeTitle: 'Generar cargo',
  chargeDescription:
    'Crea un ítem realizado en el plan «Cargos administrativos» del paciente. Puedes bajar el importe, nunca subirlo por encima del sugerido.',
  amount: 'Importe',
  amountHint: (max: string) => `Como mucho ${max}.`,
  amountAbove: (max: string) => `El importe no puede superar ${max}.`,
  amountPositive: 'Escribe un importe mayor que 0.',
  chargeSubmit: 'Generar cargo',
  chargeDone: (amount: string) => `Cargo de ${amount} generado.`,
  chargeError: 'No pudimos generar el cargo. Intenta de nuevo.',
  waiveTitle: 'Condonar el cargo',
  waiveDescription: 'No se cobrará. El motivo queda con la cita y la condonación, en la auditoría.',
  ...feeReasonCopy,
  waiveSubmit: 'Condonar',
  waiveDone: 'Cargo condonado.',
  waiveError: 'No pudimos condonar el cargo. Intenta de nuevo.',
};

const copy = cancellationFeeCopy;

function money(amount: number | null | undefined, currency: string | null | undefined): string | null {
  return amount !== null && amount !== undefined && currency ? formatCurrency(amount, currency) : null;
}

/**
 * DX-291: en el detalle de una cita NO_SHOW o cancelada tarde, el estado del
 * cargo y las acciones «Generar cargo» y «Condonar» (y, ya generado, «Anular
 * cargo» con motivo, SEC-050) (ADMIN, o RECEPTION si la
 * política de la sede lo permite; el servidor decide y lo dice en
 * `canManage`). Los 409 del servidor («No consta que el paciente fuera
 * informado…») salen tal cual, sin botón de cobrar.
 */
export function CancellationFeePanel({ token, appointmentId }: { token: string; appointmentId: string }) {
  const [view, setView] = useState<CancellationFeeView | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [dialog, setDialog] = useState<'charge' | 'waive' | 'void' | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCancellationFee(token, appointmentId)
      .then((res) => {
        if (cancelled) return;
        setView(res);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token, appointmentId, reloadKey]);

  if (failed) {
    return (
      <section aria-label={copy.heading} className="border-t border-hairline pt-4">
        <FieldError
          label={copy.loadError}
          onRetry={() => {
            setFailed(false);
            setReloadKey((k) => k + 1);
          }}
          className="h-9"
        />
      </section>
    );
  }
  if (view === null) {
    return (
      <div role="status" className="border-t border-hairline pt-4">
        <span className="sr-only">{copy.loading}</span>
        <span className="block h-5 w-56 animate-pulse rounded bg-surface-2" />
      </div>
    );
  }
  if (!view.eligible && view.status === 'NONE') return null;

  const suggested = money(view.communicated?.suggestedFee, view.communicated?.currency);
  const fee = view.fee;

  return (
    <section
      aria-labelledby={`fee-${appointmentId}`}
      data-testid="cancellation-fee-panel"
      className="flex flex-col gap-2 border-t border-hairline pt-4 text-sm"
    >
      <h3 id={`fee-${appointmentId}`} className="font-semibold text-ink">
        {copy.heading}
      </h3>
      {view.status === 'VOIDED' && fee ? (
        <div className="flex flex-col gap-1">
          <p className="tabular-nums text-ink">{copy.voided(money(fee.amount, fee.currency) ?? '')}</p>
          {fee.voidReason ? (
            <p className="whitespace-pre-line break-words text-muted">{copy.voidedReason(fee.voidReason)}</p>
          ) : null}
          {fee.voidedByName ? <p className="text-muted">{copy.by(fee.voidedByName)}</p> : null}
        </div>
      ) : view.status === 'CHARGED' && fee?.planItemRemoved ? (
        <div className="flex flex-col gap-1">
          <p className="tabular-nums text-ink">{copy.removed(money(fee.amount, fee.currency) ?? '')}</p>
          <p className="text-muted">{copy.removedHint}</p>
        </div>
      ) : view.status === 'CHARGED' && fee ? (
        <div className="flex flex-col gap-1">
          <p className="tabular-nums text-ink">{copy.charged(money(fee.amount, fee.currency) ?? '')}</p>
          <p className="text-muted">{copy.chargedHint}</p>
          {fee.itemMismatch && fee.itemAmount !== null ? (
            <p role="status" className="text-warning">
              {copy.mismatch(money(fee.itemAmount, fee.currency) ?? '', money(fee.amount, fee.currency) ?? '')}
            </p>
          ) : null}
          <Link
            href={`/patients/${view.patientId}?tab=account-statement`}
            className="inline-flex min-h-11 items-center gap-1.5 self-start font-medium text-primary underline-offset-4 hover:underline sm:min-h-0"
          >
            <Receipt aria-hidden className="size-4" />
            {copy.goToStatement}
          </Link>
          {view.canManage ? (
            <Button
              type="button"
              variant="secondary"
              className="w-full self-start sm:w-auto"
              onClick={() => setDialog('void')}
            >
              <Undo2 aria-hidden />
              {copy.voidAction}
            </Button>
          ) : null}
        </div>
      ) : view.status === 'WAIVED' && fee ? (
        <div className="flex flex-col gap-1">
          <p className="text-ink">{copy.waived}</p>
          {fee.waiveReason ? (
            <p className="whitespace-pre-line break-words text-muted">{copy.waivedReason(fee.waiveReason)}</p>
          ) : null}
          {fee.createdByName ? <p className="text-muted">{copy.by(fee.createdByName)}</p> : null}
        </div>
      ) : (
        <>
          {view.chargeBlockMessage ? (
            <p className="text-ink" data-testid="cancellation-fee-block">
              {view.chargeBlockMessage}
            </p>
          ) : suggested && view.communicated ? (
            <p className="tabular-nums text-ink">{copy.suggested(suggested, view.communicated.version)}</p>
          ) : null}
          {view.canManage ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              {view.chargeBlock === null ? (
                <Button type="button" className="w-full sm:w-auto" onClick={() => setDialog('charge')}>
                  <Receipt aria-hidden />
                  {copy.charge}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={() => setDialog('waive')}
              >
                <Ban aria-hidden />
                {copy.waive}
              </Button>
            </div>
          ) : (
            <p className="text-muted">{copy.readOnly}</p>
          )}
        </>
      )}
      {dialog === 'charge' && view.communicated?.suggestedFee != null && view.communicated.currency ? (
        <ChargeFeeModal
          token={token}
          appointmentId={appointmentId}
          suggested={view.communicated.suggestedFee}
          currency={view.communicated.currency}
          onClose={() => setDialog(null)}
          onDone={(next) => {
            setDialog(null);
            setView(next);
          }}
          onStale={() => setReloadKey((k) => k + 1)}
        />
      ) : null}
      {dialog === 'void' ? (
        <VoidCancellationFeeModal
          token={token}
          appointmentId={appointmentId}
          onClose={() => setDialog(null)}
          onDone={(next) => {
            setDialog(null);
            setView(next);
          }}
          onStale={() => setReloadKey((k) => k + 1)}
        />
      ) : null}
      {dialog === 'waive' ? (
        <WaiveFeeModal
          token={token}
          appointmentId={appointmentId}
          onClose={() => setDialog(null)}
          onDone={(next) => {
            setDialog(null);
            setView(next);
          }}
          onStale={() => setReloadKey((k) => k + 1)}
        />
      ) : null}
    </section>
  );
}

function ChargeFeeModal({
  token,
  appointmentId,
  suggested,
  currency,
  onClose,
  onDone,
  onStale,
}: {
  token: string;
  appointmentId: string;
  suggested: number;
  currency: string;
  onClose: () => void;
  onDone: (view: CancellationFeeView) => void;
  /** 409: otra persona ya decidió; el panel se relee por debajo. */
  onStale: () => void;
}) {
  const id = useId();
  const amountId = `${id}-amount`;
  const max = formatCurrency(suggested, currency);
  const [amountText, setAmountText] = useState(moneyInputText(suggested));
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = parseMoneyInput(amountText, currency);
    const problem = !parsed.ok
      ? parsed.message
      : parsed.value <= 0
        ? copy.amountPositive
        : parsed.value > suggested
          ? copy.amountAbove(max)
          : null;
    if (problem || !parsed.ok) {
      setFieldError(problem);
      document.getElementById(amountId)?.focus();
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const next = await chargeCancellationFee(
        token,
        appointmentId,
        parsed.value === suggested ? undefined : parsed.value,
      );
      toast.success(copy.chargeDone(formatCurrency(parsed.value, currency)));
      onDone(next);
    } catch (err) {
      setError(apiErrorMessage(err, copy.chargeError));
      if (err instanceof ApiError && err.status === 409) onStale();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormModal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={copy.chargeTitle}
      description={copy.chargeDescription}
      onSubmit={handleSubmit}
      submitLabel={copy.chargeSubmit}
      submitting={submitting}
      error={error}
    >
      <FormField
        htmlFor={amountId}
        label={copy.amount}
        error={fieldError ?? undefined}
        hint={copy.amountHint(max)}
        hintId={`${amountId}-hint`}
      >
        <MoneyInput
          id={amountId}
          value={amountText}
          onValueChange={(v) => {
            setAmountText(v);
            setFieldError(null);
          }}
          currency={currency}
          requirePositive
          disabled={submitting}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? fieldErrorId(amountId) : `${amountId}-hint`}
        />
      </FormField>
    </FormModal>
  );
}

function WaiveFeeModal({
  token,
  appointmentId,
  onClose,
  onDone,
  onStale,
}: {
  token: string;
  appointmentId: string;
  onClose: () => void;
  onDone: (view: CancellationFeeView) => void;
  /** 409: otra persona ya decidió; el panel se relee por debajo. */
  onStale: () => void;
}) {
  return (
    <FeeReasonModal
      title={copy.waiveTitle}
      description={copy.waiveDescription}
      submitLabel={copy.waiveSubmit}
      submit={(reason) => waiveCancellationFee(token, appointmentId, reason)}
      doneMessage={copy.waiveDone}
      errorMessage={copy.waiveError}
      onClose={onClose}
      onDone={onDone}
      onStale={onStale}
    />
  );
}
