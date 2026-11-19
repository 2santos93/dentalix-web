'use client';
import * as React from 'react';
import { useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { moneyInputText, parseMoneyInput } from '@/lib/format/money';
import {
  createBankAccount,
  updateBankAccount,
  type BankAccount,
} from '@/lib/bank-reconciliation/bank-reconciliation-api';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { MoneyInput } from '@/components/shared/money-input';
import { CurrencySelect } from '@/components/shared/currency-select';
import { FieldError } from '@/components/errors/field-error';
import { InlineError } from '@/components/errors/inline-error';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { usePaymentMethods } from '@/components/payments/use-payment-methods';

export const bankAccountCopy = {
  createTitle: 'Nueva cuenta de conciliación',
  editTitle: 'Editar cuenta de conciliación',
  description:
    'La cuenta del banco donde llegan las transferencias y los pagos móviles. Sus abonos se comparan con el extracto que subas.',
  name: 'Nombre de la cuenta',
  nameHint: 'Como la reconoce tu equipo, p. ej. «Cuenta corriente en bolívares».',
  nameMissing: 'Escribe el nombre de la cuenta.',
  currency: 'Moneda',
  currencyHint: 'Solo se concilian abonos en esta moneda.',
  currencyMissing: 'Elige la moneda de la cuenta.',
  methods: 'Medios que llegan a esta cuenta',
  methodsHint: 'Cada medio puede pertenecer a una sola cuenta. El efectivo no se concilia.',
  methodsMissing: 'Elige al menos un medio de pago.',
  methodsError: 'Medios no disponibles',
  methodsEmpty: 'La clínica no tiene medios de pago que no sean efectivo. Créalos en Ajustes › Caja.',
  requiresReference: 'Pide referencia: se empareja solo por la referencia.',
  noReference: 'No pide referencia: sus abonos se emparejan a mano.',
  tolerance: 'Diferencia de importe aceptada',
  toleranceHint:
    'Al emparejar solo, un movimiento y un abono con la misma referencia casan si el importe difiere como mucho esto. 0 = importe exacto.',
  active: 'Cuenta activa',
  activeHint: 'Desactivada, no admite extractos nuevos; lo conciliado se conserva.',
  create: 'Crear cuenta',
  save: 'Guardar cambios',
  genericError: 'No pudimos guardar la cuenta. Intenta de nuevo.',
};
const copy = bankAccountCopy;

interface BankAccountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  /** Sin cuenta, el alta; con ella, la edición. El padre lo monta con `key`. */
  account: BankAccount | null;
  onSaved: (account: BankAccount) => void;
}

/**
 * DX-571: alta y edición de una cuenta de conciliación: nombre, moneda (del
 * catálogo), los medios de pago no efectivo que liquidan en ella y la
 * tolerancia de importe del emparejado automático. Los 409 de la API (nombre
 * o medio en uso, moneda con movimientos) traen su mensaje en español.
 */
export function BankAccountModal({ open, onOpenChange, token, account, onSaved }: BankAccountModalProps) {
  const stamp = useSedeStamp(token);
  const methods = usePaymentMethods(token, open);
  const [name, setName] = useState(account?.name ?? '');
  const [currency, setCurrency] = useState(account?.currency ?? '');
  const [methodIds, setMethodIds] = useState<string[]>(account?.paymentMethods.map((m) => m.id) ?? []);
  const [tolerance, setTolerance] = useState(moneyInputText(account?.amountTolerance ?? 0));
  const [active, setActive] = useState(account?.active ?? true);
  const [errors, setErrors] = useState<{
    name?: string;
    currency?: string;
    methods?: string;
    tolerance?: string;
  }>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Los medios que no son efectivo; los ya elegidos (aunque estén inactivos) siguen a la vista.
  const choices = [
    ...methods.methods.filter((m) => m.kind !== 'CASH'),
    ...(account?.paymentMethods ?? [])
      .filter((m) => !methods.methods.some((x) => x.id === m.id))
      .map((m) => ({ ...m, requiresReference: false })),
  ];

  function toggle(id: string, checked: boolean) {
    setMethodIds((ids) => (checked ? [...ids, id] : ids.filter((x) => x !== id)));
    setErrors((e) => ({ ...e, methods: undefined }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!name.trim()) next.name = copy.nameMissing;
    if (!currency) next.currency = copy.currencyMissing;
    if (methodIds.length === 0) next.methods = copy.methodsMissing;
    const parsed = parseMoneyInput(tolerance.trim() === '' ? '0' : tolerance, currency);
    if (!parsed.ok) next.tolerance = parsed.message;
    setErrors(next);
    if (Object.keys(next).length > 0 || !parsed.ok) {
      const first = next.name
        ? 'ba-name'
        : next.currency
          ? 'ba-currency'
          : next.methods
            ? 'ba-methods'
            : 'ba-tolerance';
      const el = document.getElementById(first);
      (el?.matches('input, select') ? el : el?.querySelector<HTMLElement>('input'))?.focus();
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        currency,
        amountTolerance: parsed.value,
        paymentMethodIds: methodIds,
      };
      const saved = account
        ? await updateBankAccount(token, account.id, { ...body, active })
        : await createBankAccount(token, body);
      onSaved(saved);
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
      title={account ? copy.editTitle : copy.createTitle}
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={account ? copy.save : copy.create}
      submitting={submitting}
      error={error}
      ownValidation
      touchTargets
    >
      <FormField htmlFor="ba-name" label={copy.name} hint={copy.nameHint} error={errors.name}>
        <Input
          id="ba-name"
          value={name}
          maxLength={80}
          autoComplete="off"
          onChange={(e) => {
            setName(e.target.value);
            setErrors((x) => ({ ...x, name: undefined }));
          }}
        />
      </FormField>
      <FormField htmlFor="ba-currency" label={copy.currency} hint={copy.currencyHint} error={errors.currency}>
        <CurrencySelect
          id="ba-currency"
          token={token}
          value={currency}
          invalid={Boolean(errors.currency)}
          ariaDescribedBy={errors.currency ? fieldErrorId('ba-currency') : undefined}
          onChange={(code) => {
            setCurrency(code);
            setErrors((x) => ({ ...x, currency: undefined }));
          }}
        />
      </FormField>
      <fieldset
        id="ba-methods"
        className="flex min-w-0 flex-col gap-2"
        aria-describedby={errors.methods ? fieldErrorId('ba-methods') : 'ba-methods-hint'}
        aria-invalid={errors.methods ? true : undefined}
      >
        <legend className="t-label mb-1 text-ink">{copy.methods}</legend>
        <p id="ba-methods-hint" className="text-xs text-muted">
          {copy.methodsHint}
        </p>
        {methods.status === 'loading' ? (
          <div role="status" className="flex flex-col gap-2">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-6 w-1/2" />
          </div>
        ) : methods.status === 'error' ? (
          <FieldError label={copy.methodsError} onRetry={methods.retry} className="h-10 max-sm:h-11" />
        ) : choices.length === 0 ? (
          <p className="text-sm text-muted">{copy.methodsEmpty}</p>
        ) : (
          choices.map((m) => (
            <Checkbox
              key={m.id}
              id={`ba-method-${m.id}`}
              label={m.name}
              description={m.requiresReference ? copy.requiresReference : copy.noReference}
              checked={methodIds.includes(m.id)}
              onChange={(e) => toggle(m.id, e.target.checked)}
            />
          ))
        )}
        {errors.methods ? <InlineError id={fieldErrorId('ba-methods')}>{errors.methods}</InlineError> : null}
      </fieldset>
      <FormField htmlFor="ba-tolerance" label={copy.tolerance} hint={copy.toleranceHint} error={errors.tolerance}>
        <MoneyInput
          id="ba-tolerance"
          value={tolerance}
          onValueChange={(text) => {
            setTolerance(text);
            setErrors((x) => ({ ...x, tolerance: undefined }));
          }}
          currency={currency}
          money={(amount, code) => stamp.money(amount, code)}
          containerClassName="sm:max-w-xs"
        />
      </FormField>
      {account ? (
        <Checkbox
          id="ba-active"
          label={copy.active}
          description={copy.activeHint}
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
        />
      ) : null}
    </FormModal>
  );
}
