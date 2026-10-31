'use client';
import * as React from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { FormModal } from '@/components/shared/form-modal';
import { AsyncSection } from '@/components/shared/async-section';
import { fieldErrorId } from '@/components/shared/form-field';
import { MoneyInput } from '@/components/shared/money-input';
import { InlineError } from '@/components/errors/inline-error';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency } from '@/lib/format/currency';
import { formatCivilDate } from '@/lib/format/date';
import { moneyInputText, parseMoneyInput } from '@/lib/format/money';
import { allocationCopy } from '@/lib/payments/allocation-copy';
import type { PaymentAllocations, ReplacePaymentAllocationsInput } from '@/lib/payments/payment-allocations-api';
import { PLAN_STATUS_LABELS, isPlanBillable } from '@/lib/treatment-plans/plan-status';
import { cn } from '@/lib/utils';
import { usePaymentAllocations } from './use-payment-allocations';

// Copy como constantes (i18n-ready), igual que el resto de vistas.
const copy = {
  title: 'Imputar abono',
  available: (amount: string) => `Disponible para imputar: ${amount}`,
  converted: (amount: string, date: string) => `Convertido de ${amount} con la tasa del ${date}.`,
  modeLegend: 'Cómo se imputa',
  modeAuto: 'Reparto automático',
  modeAutoHelp: 'Se reparte solo, primero lo realizado y del abono más antiguo al más reciente.',
  modeManual: 'Fijar a mano',
  modeManualHelp: 'Tú decides cuánto cubre de cada ítem; el reparto automático no lo toca.',
  table: 'Ítems imputables del plan',
  // Lo que este abono todavía puede cubrir del ítem (facturable − lo de otros
  // abonos); no es el «Pendiente» del plan, que descuenta también este abono.
  colFree: 'Libre para este abono',
  colAmount: 'Importe',
  amountLabel: (procedure: string, tooth: string) =>
    tooth ? `Importe para ${procedure} del diente ${tooth}` : `Importe para ${procedure}`,
  footer: (allocated: string, unallocated: string) => `Imputado ${allocated} · Sin imputar ${unallocated}`,
  over: (excess: string) => `La suma supera el abono en ${excess}.`,
  overItem: (free: string) => `Este ítem admite como máximo ${free}.`,
  clear: 'Dejar sin imputar',
  submit: 'Guardar imputación',
  submitting: 'Guardando…',
  reload: 'Volver a cargar',
  noRate: 'No hay tasa de cambio para la fecha de este abono: todavía no se puede imputar.',
  notBillable: (status: string) => `El plan está «${status}»: sus abonos no se imputan a ítems.`,
  noItems: 'Este plan no tiene ítems aceptados ni realizados: el abono queda sin imputar.',
  noItemsPinned: 'Está fijado a mano: al guardar vuelve al reparto automático y cubrirá los ítems que se acepten.',
  saved: 'Imputación guardada.',
};


type Mode = ReplacePaymentAllocationsInput['mode'];

/** Recibo · importe · fecha civil; sin serie (abonos anteriores a DX-136), solo importe y fecha. */
function allocationSubject(data: PaymentAllocations): string {
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
  const bodyRef = useRef<HTMLDivElement>(null);
  // «Volver a cargar» y «Reintentar» sustituyen el contenido por el esqueleto:
  // al terminar, el foco va al primer control de la lectura nueva.
  const refocusAfterLoadRef = useRef(false);

  function reloadAndRefocus() {
    refocusAfterLoadRef.current = true;
    reload();
  }

  useEffect(() => {
    if (loading || !refocusAfterLoadRef.current) return;
    refocusAfterLoadRef.current = false;
    const body = bodyRef.current;
    const target =
      body?.querySelector<HTMLElement>('input[type="text"]:not(:disabled)') ??
      body?.querySelector<HTMLElement>('input:checked') ??
      body?.querySelector<HTMLElement>('button');
    target?.focus();
  }, [loading, data]);

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
  // Sin ítems imputables, fijar a mano solo dejaría el abono fijado con nada
  // (y el reparto ya no lo tocaría al aceptar ítems): no se ofrece. Lo único
  // que se puede hacer es devolver al automático uno que ya estaba fijado.
  const noItems = data !== null && data.items.length === 0;
  const effectiveMode: Mode = noItems ? 'AUTO' : mode;
  const canSave =
    !loading && data !== null && billable && data.planAmount !== null && (!noItems || data.manual);

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
    if (effectiveMode === 'AUTO') {
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
      const firstInvalid = Object.keys(errors)[0];
      if (firstInvalid) {
        document.getElementById(`${baseId}-amount-${firstInvalid}`)?.focus();
        return;
      }
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
          <Button type="button" variant="secondary" size="sm" onClick={reloadAndRefocus} disabled={loading}>
            {copy.reload}
          </Button>
        </div>
      ) : null}
      <div ref={bodyRef} className="contents">
        <AsyncSection
          loading={loading}
          error={error}
          onRetry={reloadAndRefocus}
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

                {noItems ? (
                  <div className="flex flex-col gap-1 text-sm text-muted">
                    <p>{copy.noItems}</p>
                    {data.manual ? <p>{copy.noItemsPinned}</p> : null}
                  </div>
                ) : (
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
                )}

                {!noItems && mode === 'MANUAL' ? (
                  <div className="flex flex-col gap-3">
                    <div className="overflow-hidden rounded-lg border border-border bg-surface">
                      <Table aria-label={copy.table}>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead scope="col">{allocationCopy.colProcedure}</TableHead>
                            <TableHead scope="col">{allocationCopy.colTooth}</TableHead>
                            <TableHead scope="col">{allocationCopy.colStatus}</TableHead>
                            <TableHead scope="col" className="whitespace-nowrap text-right">
                              {copy.colFree}
                            </TableHead>
                            <TableHead scope="col">{copy.colAmount}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {parsed.map(({ item, text, result }) => {
                            const fieldId = `${baseId}-amount-${item.itemId}`;
                            const fieldError = fieldErrors[item.itemId];
                            // Cortesía, como el pie: la línea por encima de lo libre es la
                            // que el servidor rechazaría con «Un ítem admite como máximo…».
                            const overItem =
                              !fieldError && result?.ok === true && toCents(result.value) > toCents(item.free);
                            const overItemId = `${fieldId}-over`;
                            return (
                              <TableRow key={item.itemId} className="hover:bg-transparent">
                                <TableCell className="font-medium break-words" data-label={allocationCopy.colProcedure}>
                                  {item.procedureName}
                                </TableCell>
                                <TableCell className="tabular-nums" data-label={allocationCopy.colTooth}>
                                  {item.toothNumber || <span className="text-muted">{allocationCopy.noTooth}</span>}
                                </TableCell>
                                <TableCell data-label={allocationCopy.colStatus}>
                                  <StatusBadge kind="treatmentPlanItem" status={item.status} />
                                </TableCell>
                                <TableCell className="text-right tabular-nums" data-label={copy.colFree}>
                                  {formatCurrency(item.free, data.planCurrency)}
                                </TableCell>
                                <TableCell className="sm:w-56" data-label={copy.colAmount}>
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
                                    aria-describedby={
                                      fieldError ? fieldErrorId(fieldId) : overItem ? overItemId : undefined
                                    }
                                  />
                                  {fieldError ? (
                                    <InlineError id={fieldErrorId(fieldId)} className="text-xs">
                                      {fieldError}
                                    </InlineError>
                                  ) : overItem ? (
                                    <p id={overItemId} className="text-xs text-danger-text tabular-nums">
                                      {copy.overItem(formatCurrency(item.free, data.planCurrency))}
                                    </p>
                                  ) : null}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div
                        className={cn('flex flex-col gap-0.5 text-sm tabular-nums', over ? 'text-danger-text' : 'text-ink')}
                      >
                        <p className="font-medium">
                          {copy.footer(
                            formatCurrency(allocatedCents / 100, data.planCurrency),
                            // Nunca negativo: cuánto se pasa lo dice el aviso de abajo.
                            formatCurrency(Math.max(0, planCents - allocatedCents) / 100, data.planCurrency),
                          )}
                        </p>
                        {/* Solo el aviso es alerta: el Σ cambia con cada tecla y no debe leerse cada vez. */}
                        {over ? (
                          <p role="alert">
                            {copy.over(formatCurrency((allocatedCents - planCents) / 100, data.planCurrency))}
                          </p>
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
      </div>
    </FormModal>
  );
}
