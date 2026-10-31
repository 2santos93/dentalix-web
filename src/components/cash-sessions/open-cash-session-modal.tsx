'use client';
import * as React from 'react';
import { useId, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  CASH_NOTES_MAX,
  openCashSession,
  type CashSessionDetail,
} from '@/lib/cash-sessions/cash-sessions-api';
import { parseMoneyInput } from '@/lib/format/money';
import { FormModal } from '@/components/shared/form-modal';
import { CurrencySelect } from '@/components/shared/currency-select';
import { MoneyInput } from '@/components/shared/money-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { InlineError } from '@/components/errors/inline-error';

const copy = {
  title: 'Abrir caja',
  description: (sede: string) =>
    `Tu caja en ${sede}. Cuenta el fondo con el que empiezas: al cerrar se suma a lo cobrado en efectivo.`,
  floatsLegend: 'Fondo inicial',
  currency: (n: number) => `Moneda del fondo ${n}`,
  amount: (n: number) => `Importe del fondo ${n}`,
  addCurrency: 'Añadir otra moneda',
  removeCurrency: (n: number) => `Quitar la moneda ${n}`,
  notes: 'Notas (opcional)',
  notesHint: 'Por ejemplo, «Turno de mañana».',
  invalidAmount: 'Hay fondos que no se entienden: revisa los marcados (0 si empiezas sin fondo).',
  duplicateCurrency: 'Cada moneda va una sola vez.',
  submit: 'Abrir caja',
  genericError: 'No pudimos abrir la caja. Intenta de nuevo.',
};

interface FloatRow {
  key: number;
  currency: string;
  amount: string;
}

/** Por qué no se entiende el fondo de una fila (`null` si vale; vacío es 0). */
function floatError(row: FloatRow): string | null {
  if (row.amount.trim() === '') return null;
  const parsed = parseMoneyInput(row.amount, row.currency);
  return parsed.ok ? null : parsed.message;
}

interface OpenCashSessionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  /** Nombre de la sede donde se abre (la activa o la principal). */
  sedeName: string;
  /** Moneda con la que empieza el fondo (la de la sede). */
  defaultCurrency: string;
  onOpened: (session: CashSessionDetail) => void;
}

/**
 * Abrir mi caja (DX-027) con el fondo inicial por moneda. La sede la pone la
 * cabecera de la sede activa; quien abre sale del token. Se monta con una
 * `key` por apertura para empezar siempre en blanco.
 */
export function OpenCashSessionModal({
  open,
  onOpenChange,
  token,
  sedeName,
  defaultCurrency,
  onOpened,
}: OpenCashSessionModalProps) {
  const baseId = useId();
  const [rows, setRows] = useState<FloatRow[]>([{ key: 0, currency: defaultCurrency, amount: '' }]);
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  // Filas marcadas al intentar abrir: su motivo sale junto al campo hasta que
  // se vuelve a tocar la fila.
  const [flagged, setFlagged] = useState<ReadonlySet<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch(key: number, change: Partial<FloatRow>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));
    setFlagged((current) => {
      if (!current.has(key)) return current;
      const next = new Set(current);
      next.delete(key);
      return next;
    });
    setFormError(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // DX-241: la lectura común de los campos de dinero, con los decimales de
    // la moneda de cada fondo.
    const invalid = rows.filter((row) => floatError(row) !== null);
    if (invalid.length > 0) {
      setFlagged(new Set(invalid.map((row) => row.key)));
      setFormError(copy.invalidAmount);
      return;
    }
    const floats = rows.map((row) => {
      const parsed = parseMoneyInput(row.amount, row.currency);
      return { currency: row.currency, amount: parsed.ok ? parsed.value : 0 };
    });
    if (new Set(floats.map((f) => f.currency)).size !== floats.length) {
      setFormError(copy.duplicateCurrency);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const session = await openCashSession(token, {
        floats,
        notes: notes.trim() ? notes.trim() : undefined,
      });
      onOpened(session);
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
      description={copy.description(sedeName)}
      onSubmit={handleSubmit}
      submitLabel={copy.submit}
      submitting={submitting}
      error={error}
      touchTargets
    >
      <fieldset className="flex flex-col gap-3">
        <legend className="t-label mb-1 text-muted">{copy.floatsLegend}</legend>
        {rows.map((row, index) => {
          const amountId = `${baseId}-amount-${row.key}`;
          const rowError = flagged.has(row.key) ? floatError(row) : null;
          return (
          <div key={row.key} className="flex flex-col gap-1">
          <div className="flex items-start gap-2">
            <div className="w-28 shrink-0">
              <CurrencySelect
                id={`${baseId}-currency-${row.key}`}
                token={token}
                value={row.currency}
                onChange={(currency) => patch(row.key, { currency })}
                disabled={submitting}
                ariaLabel={copy.currency(index + 1)}
              />
            </div>
            <MoneyInput
              id={amountId}
              aria-label={copy.amount(index + 1)}
              currency={row.currency}
              placeholder="0"
              value={row.amount}
              disabled={submitting}
              onValueChange={(amount) => patch(row.key, { amount })}
              aria-invalid={rowError ? true : undefined}
              aria-describedby={rowError ? `${amountId}-error` : undefined}
              containerClassName="flex-1"
            />
            {rows.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={copy.removeCurrency(index + 1)}
                onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
                disabled={submitting}
              >
                <X aria-hidden />
              </Button>
            ) : null}
          </div>
          {rowError ? (
            <InlineError id={`${amountId}-error`} className="text-xs">
              {rowError}
            </InlineError>
          ) : null}
          </div>
          );
        })}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          disabled={submitting}
          onClick={() =>
            setRows((current) => [
              ...current,
              { key: Math.max(...current.map((r) => r.key)) + 1, currency: defaultCurrency, amount: '' },
            ])
          }
        >
          <Plus aria-hidden />
          {copy.addCurrency}
        </Button>
        {formError ? <InlineError className="text-xs">{formError}</InlineError> : null}
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${baseId}-notes`}>{copy.notes}</Label>
        <Textarea
          id={`${baseId}-notes`}
          rows={2}
          autoGrow
          maxLength={CASH_NOTES_MAX}
          value={notes}
          disabled={submitting}
          onChange={(e) => setNotes(e.target.value)}
          className="max-h-48"
        />
        <p className="text-xs text-muted">{copy.notesHint}</p>
      </div>
    </FormModal>
  );
}
