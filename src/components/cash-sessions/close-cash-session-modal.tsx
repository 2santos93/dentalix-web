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
  countedError,
  countRows,
  countsPayload,
  hasDifference,
  invalidRows,
  rowDifference,
  type CountRow,
} from '@/lib/cash-sessions/arqueo';
import { PAYMENT_METHOD_LABELS } from '@/lib/payments/payment-method';
import { formatCurrency } from '@/lib/format/currency';
import { ApiError } from '@/lib/api/client';
import { FormModal } from '@/components/shared/form-modal';
import { CurrencySelect } from '@/components/shared/currency-select';
import { Button } from '@/components/ui/button';
import { MoneyInput } from '@/components/shared/money-input';
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
  invalidCounts: 'Hay importes que no se entienden: revisa los marcados.',
  otherCurrency: 'Otra moneda para contar',
  addCurrency: 'Contar esta moneda',
  chooseCurrency: 'Elige una moneda',
  notes: 'Notas del cierre (opcional)',
  submit: 'Cerrar caja',
  genericError: 'No pudimos cerrar la caja. Intenta de nuevo.',
};

interface CloseCashSessionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  session: CashSessionDetail;
  /**
   * Moneda de la sede: la del arqueo ciego si el fondo no lleva ninguna.
   * `null` si no se sabe (sede sin configurar): no se añade ninguna fila por
   * ella y «Otra moneda» empieza vacía (GLOBAL-G1: nunca otra moneda).
   */
  defaultCurrency: string | null;
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
  // Con arqueo ciego no se sabe qué monedas se cobraron: las del fondo, la de
  // la sede y las de los ajustes y salidas de caja de este turno (esos sí se
  // ven), y quien cuenta puede añadir otra que tenga en el cajón.
  const initialRows = useMemo(
    () =>
      countRows(blind ? null : session.expected, [
        ...session.floats.map((f) => f.currency),
        ...session.adjustments.map((a) => a.currency),
        ...session.outflows.map((o) => o.currency),
        // DX-253: las devoluciones de saldo a favor en efectivo también salen del cajón.
        ...(session.creditRefunds ?? []).map((r) => r.currency),
        ...(defaultCurrency ? [defaultCurrency] : []),
      ]),
    [
      blind,
      session.expected,
      session.floats,
      session.adjustments,
      session.outflows,
      session.creditRefunds,
      defaultCurrency,
    ],
  );
  const [rows, setRows] = useState<CountRow[]>(initialRows);
  const [extraCurrency, setExtraCurrency] = useState(defaultCurrency ?? '');
  // La API recalcula el esperado con la caja bloqueada: si entró un abono
  // después de abrir este modal, puede no cuadrar aunque aquí sí. Su 400 abre
  // el campo del motivo para poder reenviar.
  const [askedReason, setAskedReason] = useState(false);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  // Filas marcadas al intentar cerrar con un importe que no se entiende: su
  // motivo sale junto al campo hasta que se vuelve a escribir en él.
  const [flagged, setFlagged] = useState<ReadonlySet<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const differs = !blind && hasDifference(rows);
  const showReason = blind || differs || askedReason;
  const counting = new Set(rows.map((row) => row.currency));
  const reasonId = `${baseId}-reason`;

  function patch(index: number, counted: string) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, counted } : row)));
    setFlagged((current) => {
      if (!current.has(index)) return current;
      const next = new Set(current);
      next.delete(index);
      return next;
    });
    setFormError(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const invalid = invalidRows(rows);
    if (invalid.length > 0) {
      setFlagged(new Set(invalid.map((row) => rows.indexOf(row))));
      setFormError(copy.invalidCounts);
      return;
    }
    const trimmed = reason.trim();
    if ((differs || askedReason) && trimmed.length < CASH_REASON_MIN) {
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
      if (err instanceof ApiError && err.status === 400) setAskedReason(true);
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
            // La diferencia se enseña cuando hay algo escrito: un «−80.000» antes
            // de contar asusta y no dice nada (al enviar, lo vacío cuenta 0).
            const diff = row.counted.trim() === '' ? null : rowDifference(row);
            const inputId = `${baseId}-count-${index}`;
            const rowError = flagged.has(index) ? countedError(row) : null;
            const errorId = `${inputId}-error`;
            return (
              <li
                key={`${row.currency}-${row.method}`}
                className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium text-ink">{copy.rowLabel(method, row.currency)}</p>
                  {row.expected !== null ? (
                    <p className="text-xs text-muted tabular-nums">
                      {copy.expected(formatCurrency(row.expected, row.currency))}
                    </p>
                  ) : null}
                </div>
                <div className="flex min-w-0 items-start gap-3 sm:justify-end">
                  <MoneyInput
                    id={inputId}
                    aria-label={copy.countedLabel(method, row.currency)}
                    currency={row.currency}
                    placeholder="0"
                    value={row.counted}
                    disabled={submitting}
                    onValueChange={(text) => patch(index, text)}
                    aria-invalid={rowError ? true : undefined}
                    aria-describedby={rowError ? errorId : undefined}
                    containerClassName="flex-1 sm:w-40 sm:flex-none"
                  />
                  {diff !== null ? (
                    <span
                      data-testid="row-difference"
                      className={cn(
                        'flex h-10 shrink-0 items-center justify-end whitespace-nowrap text-sm font-medium tabular-nums sm:min-w-28',
                        diff === 0 ? 'text-success-text' : 'text-danger-text',
                      )}
                    >
                      <span className="sr-only">{copy.difference}: </span>
                      {diff === 0 ? copy.squared : formatCurrency(diff, row.currency)}
                    </span>
                  ) : null}
                </div>
                {rowError ? (
                  <InlineError id={errorId} className="text-xs sm:basis-full">
                    {rowError}
                  </InlineError>
                ) : null}
              </li>
            );
          })}
        </ul>
        {blind ? (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="w-full sm:w-44 sm:shrink-0">
              <CurrencySelect
                id={`${baseId}-extra-currency`}
                token={token}
                value={extraCurrency}
                onChange={setExtraCurrency}
                disabled={submitting}
                ariaLabel={copy.otherCurrency}
                placeholder={extraCurrency ? undefined : copy.chooseCurrency}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={submitting || !extraCurrency || counting.has(extraCurrency)}
              onClick={() => setRows((current) => [...current, ...countRows(null, [extraCurrency])])}
            >
              {copy.addCurrency}
            </Button>
          </div>
        ) : null}
      </fieldset>

      {showReason ? (
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
