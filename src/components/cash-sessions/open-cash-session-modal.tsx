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
import { parseCounted } from '@/lib/cash-sessions/arqueo';
import { FormModal } from '@/components/shared/form-modal';
import { CurrencySelect } from '@/components/shared/currency-select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { InlineError } from '@/components/errors/inline-error';
import { fieldClass } from '@/lib/ui/field-class';

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
  invalidAmount: 'Escribe el fondo con como mucho 2 decimales (0 si empiezas sin fondo).',
  duplicateCurrency: 'Cada moneda va una sola vez.',
  submit: 'Abrir caja',
  genericError: 'No pudimos abrir la caja. Intenta de nuevo.',
};

interface FloatRow {
  key: number;
  currency: string;
  amount: string;
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch(key: number, change: Partial<FloatRow>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));
    setFormError(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const floats = rows.map((row) => ({
      currency: row.currency,
      amount: row.amount.trim() === '' ? 0 : parseCounted(row.amount),
    }));
    if (floats.some((f) => f.amount === null)) {
      setFormError(copy.invalidAmount);
      return;
    }
    if (new Set(floats.map((f) => f.currency)).size !== floats.length) {
      setFormError(copy.duplicateCurrency);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const session = await openCashSession(token, {
        floats: floats.map((f) => ({ currency: f.currency, amount: f.amount as number })),
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
    >
      <fieldset className="flex flex-col gap-3">
        <legend className="t-label mb-1 text-muted">{copy.floatsLegend}</legend>
        {rows.map((row, index) => (
          <div key={row.key} className="flex items-end gap-2">
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
            <Input
              aria-label={copy.amount(index + 1)}
              inputMode="decimal"
              placeholder="0"
              value={row.amount}
              disabled={submitting}
              onChange={(e) => patch(row.key, { amount: e.target.value })}
              aria-invalid={formError ? true : undefined}
              className="min-w-0 flex-1 tabular-nums"
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
        ))}
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
        <textarea
          id={`${baseId}-notes`}
          rows={2}
          maxLength={CASH_NOTES_MAX}
          value={notes}
          disabled={submitting}
          onChange={(e) => setNotes(e.target.value)}
          className={fieldClass}
        />
        <p className="text-xs text-muted">{copy.notesHint}</p>
      </div>
    </FormModal>
  );
}
