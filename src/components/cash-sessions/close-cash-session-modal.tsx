'use client';
import * as React from 'react';
import { useId, useMemo, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  CASH_DIFFERENCE_REASON_MAX,
  CASH_NOTES_MAX,
  CASH_REASON_MIN,
  closeCashSession,
  type CashSessionDetail,
} from '@/lib/cash-sessions/cash-sessions-api';
import {
  countRows,
  countsPayload,
  hasDifference,
  invalidRows,
  rowDifference,
  type CountRow,
} from '@/lib/cash-sessions/arqueo';
import { PAYMENT_METHOD_LABELS } from '@/lib/payments/payment-method';
import { formatCurrency } from '@/lib/format/currency';
import { FormModal } from '@/components/shared/form-modal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InlineError } from '@/components/errors/inline-error';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';

const copy = {
  title: 'Cerrar caja',
  description:
    'Cuenta lo que hay por moneda y método. Al cerrar se guarda el arqueo y el cierre ya no se puede editar.',
  blindDescription:
    'Arqueo ciego: cuenta lo que hay por moneda y método antes de ver lo esperado. Lo que no cuentes va como 0. Al cerrar se guarda el arqueo y ya no se puede editar.',
  countsLegend: 'Arqueo',
  rowLabel: (method: string, currency: string) => `${method} · ${currency}`,
  countedLabel: (method: string, currency: string) => `Contado en ${method.toLowerCase()} (${currency})`,
  expected: (amount: string) => `Esperado ${amount}`,
  difference: 'Diferencia',
  squared: 'Cuadra',
  reason: 'Motivo de la diferencia',
  blindReason: 'Motivo, si el arqueo no cuadra',
  reasonHint: `Entre ${CASH_REASON_MIN} y ${CASH_DIFFERENCE_REASON_MAX} caracteres. Queda en el cierre.`,
  reasonRequired: `El arqueo no cuadra: explica el motivo (al menos ${CASH_REASON_MIN} caracteres).`,
  invalidCounts: 'Hay importes que no se entienden: usa números con como mucho 2 decimales.',
  notes: 'Notas del cierre (opcional)',
  submit: 'Cerrar caja',
  genericError: 'No pudimos cerrar la caja. Intenta de nuevo.',
};

interface CloseCashSessionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  session: CashSessionDetail;
  /** Moneda de la sede: la del arqueo ciego si el fondo no lleva ninguna. */
  defaultCurrency: string;
  onClosed: (session: CashSessionDetail) => void;
}

/**
 * Cerrar la caja con arqueo (DX-027). Con el esperado a la vista, una fila por
 * cada moneda y método esperados con la diferencia en vivo; si no cuadra, el
 * motivo es obligatorio. Con «arqueo ciego» (`blindHidden`), las filas van en
 * blanco y sin esperado: la API calcula la diferencia y pide el motivo si hace
 * falta. La API recalcula todo con la caja bloqueada: esto solo guía.
 */
export function CloseCashSessionModal({
  open,
  onOpenChange,
  token,
  session,
  defaultCurrency,
  onClosed,
}: CloseCashSessionModalProps) {
  const baseId = useId();
  const blind = session.blindHidden;
  const initialRows = useMemo(
    () =>
      countRows(blind ? null : session.expected, [
        ...session.floats.map((f) => f.currency),
        defaultCurrency,
      ]),
    [blind, session.expected, session.floats, defaultCurrency],
  );
  const [rows, setRows] = useState<CountRow[]>(initialRows);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const differs = !blind && hasDifference(rows);
  const reasonId = `${baseId}-reason`;

  function patch(index: number, counted: string) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, counted } : row)));
    setFormError(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (invalidRows(rows).length > 0) {
      setFormError(copy.invalidCounts);
      return;
    }
    const trimmed = reason.trim();
    if (differs && trimmed.length < CASH_REASON_MIN) {
      setFormError(copy.reasonRequired);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const closed = await closeCashSession(token, session.id, {
        counts: countsPayload(rows),
        differenceReason: trimmed.length >= CASH_REASON_MIN ? trimmed : undefined,
        notes: notes.trim() ? notes.trim() : undefined,
      });
      onClosed(closed);
    } catch (err) {
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
      description={blind ? copy.blindDescription : copy.description}
      onSubmit={handleSubmit}
      submitLabel={copy.submit}
      submitting={submitting}
      error={error}
      size="lg"
    >
      <fieldset className="flex flex-col">
        <legend className="t-label mb-2 text-muted">{copy.countsLegend}</legend>
        <ul className="divide-y divide-hairline rounded-lg border border-border">
          {rows.map((row, index) => {
            const method = PAYMENT_METHOD_LABELS[row.method];
            const diff = rowDifference(row);
            const inputId = `${baseId}-count-${index}`;
            return (
              <li
                key={`${row.currency}-${row.method}`}
                className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium text-ink">{copy.rowLabel(method, row.currency)}</p>
                  {row.expected !== null ? (
                    <p className="text-xs text-muted tabular-nums">
                      {copy.expected(formatCurrency(row.expected, row.currency))}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-3 sm:justify-end">
                  <Input
                    id={inputId}
                    aria-label={copy.countedLabel(method, row.currency)}
                    inputMode="decimal"
                    placeholder="0"
                    value={row.counted}
                    disabled={submitting}
                    onChange={(e) => patch(index, e.target.value)}
                    className="w-full tabular-nums sm:w-40"
                  />
                  {diff !== null ? (
                    <span
                      data-testid="row-difference"
                      className={cn(
                        'w-28 shrink-0 text-right text-sm font-medium tabular-nums',
                        diff === 0 ? 'text-success' : 'text-danger',
                      )}
                    >
                      <span className="sr-only">{copy.difference}: </span>
                      {diff === 0 ? copy.squared : formatCurrency(diff, row.currency)}
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </fieldset>

      {blind || differs ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={reasonId}>{blind ? copy.blindReason : copy.reason}</Label>
          <textarea
            id={reasonId}
            rows={2}
            maxLength={CASH_DIFFERENCE_REASON_MAX}
            value={reason}
            disabled={submitting}
            onChange={(e) => {
              setReason(e.target.value);
              setFormError(null);
            }}
            className={fieldClass}
          />
          <p className="text-xs text-muted">{copy.reasonHint}</p>
        </div>
      ) : null}

      {formError ? <InlineError>{formError}</InlineError> : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${baseId}-notes`}>{copy.notes}</Label>
        <textarea
          id={`${baseId}-notes`}
          rows={2}
          maxLength={CASH_NOTES_MAX}
          value={notes}
          disabled={submitting}
          onChange={(e) => setNotes(e.target.value)}
          className={fieldClass}
        />
      </div>
    </FormModal>
  );
}
