'use client';
import * as React from 'react';
import { useId, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { moneyInputText, parseMoneyInput } from '@/lib/format/money';
import {
  labOrderCostAmount,
  labOrderNumberLabel,
  referencePriceText,
  setLabOrderCost,
  type LabOrder,
} from '@/lib/lab-orders/lab-orders-api';
import { useLocationsState } from '@/lib/locations/use-locations-state';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { CurrencySelect } from '@/components/shared/currency-select';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { MoneyInput } from '@/components/shared/money-input';
import { Callout } from '@/components/ui/callout';

export const labOrderCostCopy = {
  title: (n: string) => `Costo del laboratorio · orden ${n}`,
  description:
    'Lo que cobra el laboratorio por este trabajo. Solo lo ve administración; no sale en la orden impresa. Si la regla de honorarios lo indica, se descuenta de la base del procedimiento ligado.',
  amount: 'Costo',
  amountHint: 'Déjalo vacío para quitarlo.',
  currency: 'Moneda',
  currencyRequired: 'Elige la moneda del costo.',
  otherCurrency: (plan: string) =>
    `El plan del procedimiento está en ${plan}: un costo en otra moneda no se convierte ni se descuenta de los honorarios.`,
  noPlanItem: 'La orden no está ligada a un procedimiento del plan: el costo no se descuenta de ningún honorario.',
  submit: 'Guardar costo',
  genericError: 'No pudimos guardar el costo. Intenta de nuevo.',
};

const copy = labOrderCostCopy;

interface LabOrderCostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  order: LabOrder;
  onSaved: (order: LabOrder) => void;
}

/**
 * DX-018-bis: el costo del laboratorio de una orden (solo ADMIN, en cualquier
 * estado salvo anulada: el laboratorio suele facturar al entregar). La moneda
 * sugerida es la del plan del procedimiento ligado; en otra, se avisa de que
 * no se descuenta de los honorarios. Auditado en la API (antes y después).
 */
export function LabOrderCostDialog({ open, onOpenChange, token, order, onSaved }: LabOrderCostDialogProps) {
  const id = useId();
  const locations = useLocationsState(token);
  const stamp = useSedeStamp(token);
  const sedeCurrency =
    locations.status === 'ready'
      ? ((locations.locations.find((l) => l.id === order.locationId) ?? locations.locations[0])?.currency ?? '')
      : '';
  const planCurrency = order.treatmentPlanItem?.planCurrency ?? null;
  const [amount, setAmount] = useState(() => {
    const current = labOrderCostAmount(order);
    return current === null ? '' : moneyInputText(current);
  });
  const [currencyPicked, setCurrencyPicked] = useState<string | null>(order.cost?.currency ?? planCurrency);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currency = currencyPicked ?? sedeCurrency;
  const otherCurrency = amount.trim() !== '' && planCurrency !== null && currency !== '' && currency !== planCurrency;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    let cost: { amount: string; currency: string } | null = null;
    if (amount.trim() !== '') {
      if (!currency) {
        setAmountError(copy.currencyRequired);
        return;
      }
      const parsed = parseMoneyInput(amount, currency);
      if (!parsed.ok) {
        setAmountError(parsed.message);
        return;
      }
      cost = { amount: referencePriceText(parsed.value), currency };
    }
    setAmountError(null);
    setSubmitting(true);
    setError(null);
    try {
      const saved = await setLabOrderCost(token, order.id, cost);
      onOpenChange(false);
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
      title={copy.title(labOrderNumberLabel(order.number))}
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={copy.submit}
      submitting={submitting}
      error={error}
      ownValidation
      fullScreenOnMobile={false}
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <FormField htmlFor={`${id}-amount`} label={copy.amount} hint={copy.amountHint} error={amountError}>
          <MoneyInput
            id={`${id}-amount`}
            value={amount}
            currency={currency}
            money={stamp.money}
            disabled={submitting}
            aria-invalid={amountError ? true : undefined}
            aria-describedby={amountError ? fieldErrorId(`${id}-amount`) : undefined}
            onValueChange={(text) => {
              setAmount(text);
              setAmountError(null);
            }}
          />
        </FormField>
        <FormField htmlFor={`${id}-currency`} label={copy.currency}>
          <CurrencySelect
            id={`${id}-currency`}
            token={token}
            value={currency}
            disabled={submitting}
            onChange={(code) => {
              setCurrencyPicked(code);
              setAmountError(null);
            }}
          />
        </FormField>
      </div>
      {otherCurrency && planCurrency ? (
        <Callout tone="warning">{copy.otherCurrency(planCurrency)}</Callout>
      ) : null}
      {order.treatmentPlanItem === null ? <p className="text-sm text-muted">{copy.noPlanItem}</p> : null}
    </FormModal>
  );
}
