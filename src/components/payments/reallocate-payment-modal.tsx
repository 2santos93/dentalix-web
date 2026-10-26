'use client';
import * as React from 'react';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { FormModal } from '@/components/shared/form-modal';
import { AsyncSection } from '@/components/shared/async-section';
import { fieldErrorId } from '@/components/shared/form-field';
import { MoneyInput } from '@/components/shared/money-input';
import { InlineError } from '@/components/errors/inline-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency } from '@/lib/format/currency';
import { formatCivilDate } from '@/lib/format/date';
import { moneyInputText, parseMoneyInput } from '@/lib/format/money';
import type { PaymentAllocations, ReplacePaymentAllocationsInput } from '@/lib/payments/payment-allocations-api';
import { ITEM_STATUS_BADGE_VARIANT, ITEM_STATUS_LABELS } from '@/lib/treatment-plans/item-status';
import { PLAN_STATUS_LABELS, isPlanBillable } from '@/lib/treatment-plans/plan-status';
import { cn } from '@/lib/utils';
import { usePaymentAllocations } from './use-payment-allocations';

// Copy como constantes (i18n-ready), igual que el resto de vistas.
export const reallocateCopy = {
  title: 'Imputar abono',
  available: (amount: string) => `Disponible para imputar: ${amount}`,
  converted: (amount: string, date: string) => `Convertido de ${amount} con la tasa del ${date}.`,
  modeLegend: 'Cómo se imputa',
  modeAuto: 'Reparto automático',
  modeAutoHelp: 'Se reparte solo, primero lo realizado y del abono más antiguo al más reciente.',
  modeManual: 'Fijar a mano',
  modeManualHelp: 'Tú decides cuánto cubre de cada ítem; el reparto automático no lo toca.',
  table: 'Ítems imputables del plan',
  colProcedure: 'Procedimiento',
  colTooth: 'Diente',
  colStatus: 'Estado',
  colPending: 'Pendiente',
  colAmount: 'Importe',
  // DX-291: un cargo administrativo no tiene diente.
  noTooth: 'Sin diente',
  amountLabel: (procedure: string, tooth: string) =>
    tooth ? `Importe para ${procedure} del diente ${tooth}` : `Importe para ${procedure}`,
  footer: (allocated: string, unallocated: string) => `Imputado ${allocated} · Sin imputar ${unallocated}`,
  over: (excess: string) => `La suma supera el abono en ${excess}.`,
  clear: 'Dejar sin imputar',
  submit: 'Guardar imputación',
  submitting: 'Guardando…',
  reload: 'Volver a cargar',
  noRate: 'No hay tasa de cambio para la fecha de este abono: todavía no se puede imputar.',
  notBillable: (status: string) => `El plan está «${status}»: sus abonos no se imputan a ítems.`,
  noItems: 'Este plan no tiene ítems aceptados ni realizados: el abono queda sin imputar.',
  saved: 'Imputación guardada.',
};

const copy = reallocateCopy;

type Mode = ReplacePaymentAllocationsInput['mode'];

/** Recibo · importe · fecha civil; sin serie (abonos anteriores a DX-136), solo importe y fecha. */
export function allocationSubject(data: PaymentAllocations): string {
  return [data.receiptNumber, formatCurrency(data.paymentAmount, data.paymentCurrency), formatCivilDate(data.paidOn)]
    .filter(Boolean)
    .join(' · ');
}

/** Lo escrito en cada campo, por ítem, a partir de la imputación actual del abono. */
function amountsOf(data: PaymentAllocations): Record<string, string> {
  return Object.fromEntries(data.allocations.map((line) => [line.treatmentPlanItemId, moneyInputText(line.amount)]));
}

const toCents = (amount: number) => Math.round(amount * 100);

interface ReallocatePaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentId: string;
  token: string;
  /** Tras guardar: quien lo abre recarga saldo y abonos. */
  onSaved: () => void;
  /** Ver `FormModal`: a dónde va el foco si el botón que lo abrió ya no está. */
  onCloseAutoFocus?: (event: Event) => void;
}

/**
 * «Imputar abono» (DX-051, solo ADMIN): devuelve el abono al reparto
 * automático o fija a mano cuánto cubre de cada ítem aceptado o realizado del
 * plan. El pie suma lo escrito como cortesía; la frontera es el servidor, que
 * responde en español (400 por línea o por suma, 409 si la imputación cambió
 * mientras tanto). Quien lo usa lo monta con una `key` por abono.
 */
export function ReallocatePaymentModal({
  open,
  onOpenChange,
  paymentId,
  token,
  onSaved,
  onCloseAutoFocus,
}: ReallocatePaymentModalProps) {
  const { data, loading, error, reload, save, saving, saveError } = usePaymentAllocations(token, paymentId);
  const baseId = useId();

  // El formulario se rehace cada vez que llega una lectura nueva (al abrir y
  // con «Volver a cargar»): lo escrito sobre una versión vieja no vale.
  const [formFor, setFormFor] = useState<PaymentAllocations | null>(null);
  const [mode, setMode] = useState<Mode>('AUTO');
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  if (data !== formFor) {
    setFormFor(data);
    if (data) {
      setMode(data.manual ? 'MANUAL' : 'AUTO');
      setAmounts(amountsOf(data));
      setFieldErrors({});
    }
  }

  const billable = data ? isPlanBillable(data.planStatus) : false;
  const canSave = !loading && data !== null && billable && data.planAmount !== null;

  const parsed = data
    ? data.items.map((item) => {
        const text = amounts[item.itemId] ?? '';
        const result = text.trim() === '' ? null : parseMoneyInput(text, data.planCurrency);
        return { item, text, result };
      })
    : [];
  const allocatedCents = parsed.reduce(
    (sum, { result }) => (result?.ok && result.value > 0 ? sum + toCents(result.value) : sum),
    0,
  );
  const planCents = data?.planAmount != null ? toCents(data.planAmount) : 0;
  const over = allocatedCents > planCents;

  function setAmount(itemId: string, text: string) {
    setAmounts((prev) => ({ ...prev, [itemId]: text }));
    if (fieldErrors[itemId]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!data || !canSave || saving) return;

    let body: ReplacePaymentAllocationsInput;
    if (mode === 'AUTO') {
      body = { expectedVersion: data.version, mode: 'AUTO' };
    } else {
      const errors: Record<string, string> = {};
      const allocations: NonNullable<ReplacePaymentAllocationsInput['allocations']> = [];
      for (const { item, result } of parsed) {
        if (result === null) continue;
        if (!result.ok) errors[item.itemId] = result.message;
        // Un 0 es «nada para este ítem»: no viaja como línea.
        else if (result.value > 0) allocations.push({ treatmentPlanItemId: item.itemId, amount: result.value });
      }
      setFieldErrors(errors);
      if (Object.keys(errors).length > 0) return;
      body = { expectedVersion: data.version, mode: 'MANUAL', allocations };
    }

    if (await save(body)) {
      toast.success(copy.saved);
      onSaved();
      onOpenChange(false);
    }
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={data ? allocationSubject(data) : undefined}
      onSubmit={handleSubmit}
      submitLabel={saving ? copy.submitting : copy.submit}
      submitting={saving}
      hideSubmit={!canSave}
      error={saveError?.message ?? null}
      size="lg"
      onCloseAutoFocus={onCloseAutoFocus}
    >
      {saveError?.stale ? (
        <div>
          <Button type="button" variant="secondary" size="sm" onClick={reload}>
            {copy.reload}
          </Button>
        </div>
      ) : null}
      <AsyncSection
        loading={loading}
        error={error}
        onRetry={reload}
        skeleton={
          <div className="flex flex-col gap-3" role="status" aria-label="Cargando">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        }
      >
        {data ? (
          !billable ? (
            <p className="text-sm text-muted">{copy.notBillable(PLAN_STATUS_LABELS[data.planStatus])}</p>
          ) : data.planAmount === null ? (
            <p className="text-sm text-muted">{copy.noRate}</p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-0.5">
                <p className="font-medium text-ink tabular-nums">
                  {copy.available(formatCurrency(data.planAmount, data.planCurrency))}
                </p>
                {data.paymentCurrency !== data.planCurrency ? (
                  <p className="text-sm text-muted tabular-nums">
                    {copy.converted(
                      formatCurrency(data.paymentAmount, data.paymentCurrency),
                      formatCivilDate(data.paidOn),
                    )}
                  </p>
                ) : null}
              </div>

              <fieldset className="flex min-w-0 flex-col gap-2" disabled={saving}>
                <legend className="t-label mb-1 text-muted">{copy.modeLegend}</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      ['AUTO', copy.modeAuto, copy.modeAutoHelp],
                      ['MANUAL', copy.modeManual, copy.modeManualHelp],
                    ] as const
                  ).map(([value, label, help]) => {
                    const id = `${baseId}-mode-${value}`;
                    return (
                      <label
                        key={value}
                        htmlFor={id}
                        className={cn(
                          'flex min-h-11 cursor-pointer items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 transition-colors hover:bg-surface-2',
                          'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary',
                          mode === value && 'border-primary',
                        )}
                      >
                        <input
                          id={id}
                          type="radio"
                          name={`${baseId}-mode`}
                          value={value}
                          checked={mode === value}
                          onChange={() => setMode(value)}
                          // Nombre = solo la etiqueta; la explicación, como descripción.
                          aria-labelledby={`${id}-label`}
                          aria-describedby={`${id}-help`}
                          className="mt-1 accent-[var(--color-primary)] focus-visible:outline-none"
                        />
                        <span className="flex flex-col gap-0.5">
                          <span id={`${id}-label`} className="text-sm font-medium text-ink">
                            {label}
                          </span>
                          <span id={`${id}-help`} className="text-xs text-muted">
                            {help}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {data.items.length === 0 ? (
                <p className="text-sm text-muted">{copy.noItems}</p>
              ) : mode === 'MANUAL' ? (
                <div className="flex flex-col gap-3">
                  <div className="overflow-hidden rounded-lg border border-border bg-surface">
                    <Table aria-label={copy.table}>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead scope="col">{copy.colProcedure}</TableHead>
                          <TableHead scope="col">{copy.colTooth}</TableHead>
                          <TableHead scope="col">{copy.colStatus}</TableHead>
                          <TableHead scope="col" className="text-right">
                            {copy.colPending}
                          </TableHead>
                          <TableHead scope="col">{copy.colAmount}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parsed.map(({ item, text }) => {
                          const fieldId = `${baseId}-amount-${item.itemId}`;
                          const fieldError = fieldErrors[item.itemId];
                          return (
                            <TableRow key={item.itemId} className="hover:bg-transparent">
                              <TableCell className="font-medium break-words" data-label={copy.colProcedure}>
                                {item.procedureName}
                              </TableCell>
                              <TableCell className="tabular-nums" data-label={copy.colTooth}>
                                {item.toothNumber || <span className="text-muted">{copy.noTooth}</span>}
                              </TableCell>
                              <TableCell data-label={copy.colStatus}>
                                <Badge variant={ITEM_STATUS_BADGE_VARIANT[item.status]}>
                                  {ITEM_STATUS_LABELS[item.status]}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right tabular-nums" data-label={copy.colPending}>
                                {formatCurrency(item.free, data.planCurrency)}
                              </TableCell>
                              <TableCell className="sm:w-44" data-label={copy.colAmount}>
                                <label htmlFor={fieldId} className="sr-only">
                                  {copy.amountLabel(item.procedureName, item.toothNumber)}
                                </label>
                                <MoneyInput
                                  id={fieldId}
                                  value={text}
                                  onValueChange={(next) => setAmount(item.itemId, next)}
                                  currency={data.planCurrency}
                                  disabled={saving}
                                  aria-invalid={fieldError ? true : undefined}
                                  aria-describedby={fieldError ? fieldErrorId(fieldId) : undefined}
                                />
                                {fieldError ? (
                                  <InlineError id={fieldErrorId(fieldId)} className="text-xs">
                                    {fieldError}
                                  </InlineError>
                                ) : null}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex flex-wrap items-start justify-between gap-3">
                    {/* Remontado (key) al pasarse, para que el lector anuncie la alerta. */}
                    <div
                      key={over ? 'over' : 'ok'}
                      role={over ? 'alert' : undefined}
                      className={cn('flex flex-col gap-0.5 text-sm tabular-nums', over ? 'text-danger' : 'text-ink')}
                    >
                      <p className="font-medium">
                        {copy.footer(
                          formatCurrency(allocatedCents / 100, data.planCurrency),
                          formatCurrency((planCents - allocatedCents) / 100, data.planCurrency),
                        )}
                      </p>
                      {over ? (
                        <p>{copy.over(formatCurrency((allocatedCents - planCents) / 100, data.planCurrency))}</p>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={saving}
                      onClick={() => {
                        setAmounts({});
                        setFieldErrors({});
                      }}
                    >
                      {copy.clear}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          )
        ) : null}
      </AsyncSection>
    </FormModal>
  );
}
