'use client';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { getPayableExpenses, type Expense, type PayableExpenses } from '@/lib/expenses/expenses-api';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { SectionError } from '@/components/errors/section-error';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { amountCents, centsToAmount } from '@/lib/money/round';
import { ExpensePaymentModal } from './expense-payment-modal';
import { ExpenseStatusBadges } from './expense-status-badges';
import { PHONE_FULL_SCREEN } from './phone-full-screen';

export const expenseSupplierCopy = {
  loading: 'Cargando sus gastos por pagar…',
  description: (count: number, pending: string) =>
    `${count === 1 ? '1 gasto por pagar' : `${count} gastos por pagar`} · Pendiente ${pending}`,
  listLabel: (name: string) => `Gastos por pagar de ${name}, por vencimiento`,
  dueOn: (day: string) => `Vence ${day}`,
  noDueDate: 'Sin vencimiento',
  invoiceOn: (day: string) => `Factura ${day}`,
  pending: (amount: string) => `Pendiente ${amount}`,
  pay: 'Registrar pago',
  payLabel: (category: string, pending: string) => `Registrar pago de ${category}, pendiente ${pending}`,
  loadError: 'No pudimos cargar los gastos de este proveedor.',
  allPaid: 'Este proveedor ya no tiene gastos por pagar en esta moneda.',
  truncated: (shown: number, total: number) =>
    `Se muestran los ${shown} primeros de ${total} gastos, los de vencimiento más próximo.`,
};

interface ExpenseSupplierDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
  token: string;
  supplierKey: string;
  /** El nombre a mostrar («Sin proveedor» si no hay). */
  supplierName: string;
  currency: string;
  /** Con «Todas las sedes», cada gasto dice su sede. */
  showLocation: boolean;
  locations: readonly ClinicLocation[];
  /** Tras un pago: el aviso y la recarga de la lista de proveedores. */
  onChanged: (message: string) => void;
}

/**
 * Un proveedor en una moneda (DX-411): sus gastos abiertos por vencimiento
 * (sin vencimiento al final), cada uno con su «Registrar pago», el mismo
 * modal del detalle del gasto. Tras pagar se recarga la lista y el agregado.
 */
export function ExpenseSupplierDialog({
  open,
  onOpenChange,
  onCloseAutoFocus,
  token,
  supplierKey,
  supplierName,
  currency,
  showLocation,
  locations,
  onChanged,
}: ExpenseSupplierDialogProps) {
  const [data, setData] = useState<PayableExpenses | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [paying, setPaying] = useState<Expense | null>(null);
  const [payKey, setPayKey] = useState(0);
  const payTriggerRef = useRef<HTMLElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const items = data?.items ?? [];
  const stamp = useSedeStamp(
    token,
    items.map((e) => e.locationId),
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await getPayableExpenses(token, supplierKey, currency);
        if (cancelled) return;
        setData(res);
        setLoadError(null);
      } catch (err) {
        if (cancelled) return;
        setLoadError(apiErrorMessage(err, { fallback: expenseSupplierCopy.loadError }));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, supplierKey, currency, reloadKey]);

  const money = (amount: number, locationId?: string) => stamp.money(amount, currency, locationId);
  const pendingTotal = centsToAmount(items.reduce((sum, e) => sum + amountCents(e.pendingAmount), 0));
  const locationName = (id: string) => locations.find((l) => l.id === id)?.name ?? null;

  function openPay(expense: Expense) {
    const active = document.activeElement;
    payTriggerRef.current = active instanceof HTMLElement ? active : null;
    setPayKey((k) => k + 1);
    setPaying(expense);
  }

  function focusAfterPay(event: Event) {
    // El botón que abrió el pago desaparece si el gasto quedó pagado.
    if (payTriggerRef.current?.isConnected) return;
    event.preventDefault();
    titleRef.current?.focus();
  }

  let body: React.ReactNode;
  if (loadError && !data) {
    body = <SectionError description={loadError} onRetry={() => setReloadKey((k) => k + 1)} />;
  } else if (!data) {
    body = (
      <div role="status" aria-label={expenseSupplierCopy.loading} className="flex flex-col gap-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  } else if (items.length === 0) {
    body = <p className="text-sm text-muted">{expenseSupplierCopy.allPaid}</p>;
  } else {
    body = (
      <>
        <ul aria-label={expenseSupplierCopy.listLabel(supplierName)} className="flex flex-col divide-y divide-border-subtle">
          {items.map((expense) => {
            const pending = money(expense.pendingAmount, expense.locationId);
            const sede = showLocation ? locationName(expense.locationId) : null;
            return (
              <li
                key={expense.id}
                data-testid="supplier-expense"
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink [overflow-wrap:anywhere]">{expense.category}</span>
                    <ExpenseStatusBadges expense={expense} />
                  </div>
                  {expense.description ? (
                    <span className="text-sm text-muted [overflow-wrap:anywhere]">{expense.description}</span>
                  ) : null}
                  <span className="text-sm text-muted tabular-nums">
                    {[
                      expense.dueDate
                        ? expenseSupplierCopy.dueOn(stamp.civilDate(expense.dueDate, expense.locationId))
                        : expenseSupplierCopy.noDueDate,
                      expenseSupplierCopy.invoiceOn(stamp.civilDate(expense.invoiceDate, expense.locationId)),
                      sede,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
                <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                  <span className={cn('font-medium tabular-nums', expense.overdue && 'text-danger-text')}>
                    {expenseSupplierCopy.pending(pending)}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => openPay(expense)}
                    aria-label={expenseSupplierCopy.payLabel(expense.category, pending)}
                    className="max-sm:min-h-11"
                  >
                    <Plus aria-hidden />
                    {expenseSupplierCopy.pay}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
        {data.total > items.length ? (
          <p className="text-xs text-muted">{expenseSupplierCopy.truncated(items.length, data.total)}</p>
        ) : null}
      </>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('max-w-2xl', PHONE_FULL_SCREEN)} onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader className="min-w-0 pr-8">
          <DialogTitle
            ref={titleRef}
            tabIndex={-1}
            className="[overflow-wrap:anywhere] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-text"
          >
            {`${supplierName} · ${currency}`}
          </DialogTitle>
          <DialogDescription>
            {data ? expenseSupplierCopy.description(data.total, money(pendingTotal)) : expenseSupplierCopy.loading}
          </DialogDescription>
        </DialogHeader>
        <p role="status" className={notice ? 'text-sm text-success-text' : 'sr-only'}>
          {notice}
        </p>
        <SedeStampNote stamp={stamp} />
        {body}

        {paying ? (
          <ExpensePaymentModal
            key={payKey}
            open
            onOpenChange={(next) => !next && setPaying(null)}
            onCloseAutoFocus={focusAfterPay}
            token={token}
            expense={paying}
            onSaved={(_, message) => {
              setNotice(message);
              setReloadKey((k) => k + 1);
              onChanged(message);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
