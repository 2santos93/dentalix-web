'use client';
import * as React from 'react';
import { useCallback, useState } from 'react';
import { Settings2 } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  createExpense,
  requestExpenseReceiptUpload,
  updateExpense,
  type CreateExpenseInput,
  type ExpenseDetail,
  type UpdateExpenseInput,
} from '@/lib/expenses/expenses-api';
import { EXPENSE_RECEIPT_ACCEPT, EXPENSE_RECEIPT_RULES } from '@/lib/expenses/presentation';
import type { SingleFileUploadRequest } from '@/lib/files/upload-single-file';
import { formatCurrency } from '@/lib/format/currency';
import { moneyInputText } from '@/lib/format/money';
import { collapseSpaces } from '@/lib/format/text';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { useExpenseToday } from './use-expense-today';
import { SectionError } from '@/components/errors/section-error';
import { FieldError } from '@/components/errors/field-error';
import { CurrencySelect } from '@/components/shared/currency-select';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { FormModal } from '@/components/shared/form-modal';
import { MoneyInput } from '@/components/shared/money-input';
import { SingleFileField, useSingleFileUpload } from '@/components/shared/single-file-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';
import {
  ExpenseCategoryField,
  ExpenseDescriptionField,
  ExpenseSupplierField,
  expenseFieldsCopy,
  expenseTextErrors,
  parseExpenseAmount,
} from './expense-fields';
import {
  ExpensePaymentFields,
  paidOnError,
  paymentBody,
  type ExpensePaymentValue,
} from './expense-payment-fields';
import type { ExpenseCategoriesState } from './use-expense-categories';
import { locationRegionalFormat } from '@/lib/locations/location-settings';
import { SedeConfigError } from '@/components/locations/sede-config-error';

export const expenseFormCopy = {
  ...expenseFieldsCopy,
  createTitle: 'Nuevo gasto',
  createDescription:
    'Lo que la sede gastó: categoría, proveedor, importe y fechas de la factura. Si ya se pagó, regístralo aquí mismo.',
  editTitle: 'Editar gasto',
  editDescription: 'Los pagos no cambian. Para corregir uno, anúlalo y regístralo de nuevo.',
  create: 'Registrar gasto',
  save: 'Guardar cambios',
  location: 'Sede',
  locationsError: 'Sedes no disponibles',
  manageCategories: 'Gestionar categorías',
  invoiceDate: 'Fecha de factura',
  dueDate: 'Vencimiento',
  dueDateHint: 'Opcional.',
  paid: 'Ya está pagado',
  paidHint: 'Registra el pago completo junto con el gasto.',
  lockedByPayments: 'Con pagos registrados, la sede y la moneda no cambian.',
  amountMin: (paid: string) => `No puede ser menor que lo ya pagado (${paid}).`,
  invoiceDateRequired: 'Elige la fecha de la factura.',
  currencyRequired: 'Elige la moneda del gasto.',
  invoiceDateFuture: 'La fecha de la factura no puede ser futura.',
  dueBeforeInvoice: 'El vencimiento no puede ser anterior a la fecha de la factura.',
  createError: 'No pudimos registrar el gasto. Intenta de nuevo.',
  saveError: 'No pudimos guardar los cambios. Intenta de nuevo.',
  created: 'Gasto registrado.',
  saved: 'Gasto actualizado.',
};

interface FormState {
  locationId: string;
  category: string;
  supplier: string;
  description: string;
  amount: string;
  currency: string;
  invoiceDate: string;
  dueDate: string;
  paid: boolean;
  payment: ExpensePaymentValue;
}

type FieldErrors = Partial<Record<'category' | 'amount' | 'currency' | 'invoiceDate' | 'dueDate' | 'supplier' | 'description' | 'paidOn', string>>;

function initialState(locations: ClinicLocation[], defaultLocationId: string | null, expense?: ExpenseDetail): FormState {
  if (expense) {
    return {
      locationId: expense.locationId,
      category: expense.category,
      supplier: expense.supplier ?? '',
      description: expense.description ?? '',
      amount: moneyInputText(expense.amount),
      currency: expense.currency,
      invoiceDate: expense.invoiceDate,
      dueDate: expense.dueDate ?? '',
      paid: false,
      payment: { method: 'CASH', paidOn: '', fromCashSession: false },
    };
  }
  const location = locations.find((l) => l.id === defaultLocationId) ?? locations[0];
  return {
    locationId: location?.id ?? '',
    category: '',
    supplier: '',
    description: '',
    amount: '',
    currency: '',
    invoiceDate: '',
    dueDate: '',
    paid: false,
    payment: { method: 'CASH', paidOn: '', fromCashSession: false },
  };
}

interface ExpenseFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  /** Sedes de la clínica, la principal primero; se ofrecen las activas. */
  locations: ClinicLocation[];
  /** La lista de sedes no cargó: el campo Sede lo dice y deja reintentar. */
  locationsFailed?: boolean;
  onRetryLocations?: () => void;
  /** La sede activa del selector, o null en «Todas las sedes». */
  defaultLocationId: string | null;
  categories: ExpenseCategoriesState;
  onManageCategories: () => void;
  /** Para editar; sin él, alta. */
  expense?: ExpenseDetail;
  onSaved: (expense: ExpenseDetail, notice: string) => void;
  /** A dónde va el foco al cerrar si el botón que abrió el modal ya no está. */
  onCloseAutoFocus?: (event: Event) => void;
}

/**
 * Alta y edición de un gasto (DX-274). En el alta, el soporte se sube al
 * elegirlo y «Ya está pagado» registra el pago completo en la misma
 * transacción, desde la caja abierta si se marca. El padre lo monta con `key`
 * en cada apertura, así que cada vez empieza de cero (y con clave de
 * idempotencia nueva).
 */
export function ExpenseFormModal({
  open,
  onOpenChange,
  token,
  locations: allLocations,
  locationsFailed = false,
  onRetryLocations,
  defaultLocationId,
  categories,
  onManageCategories,
  expense,
  onSaved,
  onCloseAutoFocus,
}: ExpenseFormModalProps) {
  // Se elige entre las activas; editando, sigue elegible la sede del gasto.
  const locations = allLocations.filter((l) => l.isActive || l.id === expense?.locationId);
  const editing = expense !== undefined;
  const hasPayments = (expense?.payments.length ?? 0) > 0;
  const [form, setForm] = useState<FormState>(() => initialState(locations, defaultLocationId, expense));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const requestTicket = useCallback(
    (request: SingleFileUploadRequest) => requestExpenseReceiptUpload(token, request),
    [token],
  );
  const upload = useSingleFileUpload(EXPENSE_RECEIPT_RULES, requestTicket);

  // Las sedes llegan después de abrir: sin sede elegida, la propuesta.
  const [prevLocations, setPrevLocations] = useState(allLocations);
  if (allLocations !== prevLocations) {
    setPrevLocations(allLocations);
    if (!form.locationId && locations.length > 0) {
      // Solo lo que depende de la sede: lo ya escrito se queda.
      const proposed = initialState(locations, defaultLocationId, expense);
      setForm((f) => ({
        ...f,
        locationId: proposed.locationId,

      }));
    }
  }

  const { today, error: zoneError, retry: retryZone } = useExpenseToday(token, form.locationId, open);
  // G1-B: el tamaño del recibo con el formato de la sede del gasto; sin él (o sin sede elegida), «—».
  const receiptFormat = locationRegionalFormat(locations.find((l) => l.id === form.locationId));
  const [lastToday, setLastToday] = useState<string | null>(null);
  if (today && today !== lastToday) {
    setLastToday(today);
    setForm((value) => ({ ...value, invoiceDate: value.invoiceDate || today,
      payment: { ...value.payment, paidOn: value.payment.paidOn || today } }));
  }

  function patch(next: Partial<FormState>) {
    setForm((f) => ({ ...f, ...next }));
  }

  function clearError(field: keyof FieldErrors) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function changeLocation(locationId: string) {
    setForm((value) => ({ ...value, locationId }));
  }

  function validate(): { next: FieldErrors; amount: number | null } {
    const next: FieldErrors = expenseTextErrors(form);
    if (!form.currency) next.currency = expenseFormCopy.currencyRequired;
    const { amount, error: amountError } = parseExpenseAmount(form.amount, form.currency);
    if (amountError) next.amount = amountError;
    if (amount !== null && expense && Math.round(amount * 100) < Math.round(expense.paidAmount * 100)) {
      next.amount = expenseFormCopy.amountMin(formatCurrency(expense.paidAmount, expense.currency));
    }
    if (!form.invoiceDate) next.invoiceDate = expenseFormCopy.invoiceDateRequired;
    else if (today && form.invoiceDate > today) next.invoiceDate = expenseFormCopy.invoiceDateFuture;
    if (form.dueDate && form.invoiceDate && form.dueDate < form.invoiceDate) {
      next.dueDate = expenseFormCopy.dueBeforeInvoice;
    }
    if (!editing && form.paid) {
      const paidOn = paidOnError(form.payment, today ?? '');
      if (paidOn) next.paidOn = paidOn;
    }
    return { next, amount };
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!today) return;
    const { next, amount } = validate();
    setErrors(next);
    if (Object.values(next).some(Boolean) || amount === null) return;
    if (upload.state.status === 'error' && upload.state.file) {
      setError(expenseFormCopy.receiptPending);
      return;
    }
    const supplier = collapseSpaces(form.supplier);
    const description = form.description.trim();
    setSubmitting(true);
    try {
      if (expense) {
        const body: UpdateExpenseInput = {
          category: form.category,
          supplier: supplier || null,
          description: description || null,
          invoiceDate: form.invoiceDate,
          dueDate: form.dueDate || null,
          ...(amount !== expense.amount ? { amount } : {}),
          ...(form.currency !== expense.currency ? { currency: form.currency } : {}),
          ...(form.locationId !== expense.locationId ? { locationId: form.locationId } : {}),
        };
        const saved = await updateExpense(token, expense.id, body);
        onSaved(saved, expenseFormCopy.saved);
      } else {
        const body: CreateExpenseInput = {
          locationId: form.locationId,
          category: form.category,
          ...(supplier ? { supplier } : {}),
          ...(description ? { description } : {}),
          amount,
          currency: form.currency,
          invoiceDate: form.invoiceDate,
          ...(form.dueDate ? { dueDate: form.dueDate } : {}),
          ...(form.paid ? { payment: { amount, ...paymentBody(form.payment) } } : {}),
          ...(upload.uploadId ? { attachmentUploadId: upload.uploadId } : {}),
        };
        const saved = await createExpense(token, body, idempotencyKey);
        onSaved(saved, expenseFormCopy.created);
      }
      onOpenChange(false);
    } catch (err) {
      // La clave no cambia: reintentar este mismo alta no lo duplica.
      setError(apiErrorMessage(err, { fallback: editing ? expenseFormCopy.saveError : expenseFormCopy.createError }));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? expenseFormCopy.editTitle : expenseFormCopy.createTitle}
      description={editing ? expenseFormCopy.editDescription : expenseFormCopy.createDescription}
      onSubmit={(e) => void handleSubmit(e)}
      submitLabel={editing ? expenseFormCopy.save : expenseFormCopy.create}
      submitting={submitting}
      submitDisabled={upload.busy || !form.locationId || !today}
      error={error}
      size="lg"
      onCloseAutoFocus={onCloseAutoFocus}
    >
      {zoneError ? <SectionError description={zoneError} onRetry={retryZone} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          htmlFor="expense-location"
          label={expenseFormCopy.location}
          hint={hasPayments ? expenseFormCopy.lockedByPayments : undefined}
          hintId="expense-location-hint"
        >
          {locationsFailed && locations.length === 0 ? (
            <FieldError
              label={expenseFormCopy.locationsError}
              onRetry={onRetryLocations}
              className="h-10 w-full"
              retryId="expense-location"
            />
          ) : (
            <select
              id="expense-location"
              value={form.locationId}
              disabled={submitting || hasPayments || locations.length <= 1}
              onChange={(e) => changeLocation(e.target.value)}
              aria-describedby={hasPayments ? 'expense-location-hint' : undefined}
              className={cn(fieldClass, 'h-10')}
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <ExpenseCategoryField
          id="expense-category"
          value={form.category}
          onChange={(category) => {
            patch({ category });
            clearError('category');
          }}
          categories={categories}
          error={errors.category}
          disabled={submitting}
        >
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={onManageCategories}
            className="h-auto self-start px-0 max-sm:min-h-11"
          >
            <Settings2 aria-hidden />
            {expenseFormCopy.manageCategories}
          </Button>
        </ExpenseCategoryField>
      </div>

      <ExpenseSupplierField
        id="expense-supplier"
        token={token}
        enabled={open}
        value={form.supplier}
        onChange={(supplier) => {
          patch({ supplier });
          clearError('supplier');
        }}
        error={errors.supplier}
        disabled={submitting}
      />

      <ExpenseDescriptionField
        id="expense-description"
        value={form.description}
        onChange={(description) => {
          patch({ description });
          clearError('description');
        }}
        error={errors.description}
        disabled={submitting}
      />

      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <FormField htmlFor="expense-amount" label={expenseFormCopy.amount} error={errors.amount}>
          <MoneyInput
            id="expense-amount"
            currency={form.currency}
            requirePositive
            value={form.amount}
            disabled={submitting}
            onValueChange={(amount) => {
              patch({ amount });
              clearError('amount');
            }}
            aria-invalid={errors.amount ? true : undefined}
            aria-describedby={errors.amount ? fieldErrorId('expense-amount') : undefined}
          />
        </FormField>
        <FormField htmlFor="expense-currency" label={expenseFormCopy.currency} error={errors.currency}>
          <CurrencySelect
            id="expense-currency"
            placeholder="Elige moneda"
            token={token}
            value={form.currency}
            disabled={submitting || hasPayments}
            ariaDescribedBy={hasPayments ? 'expense-location-hint' : undefined}
            onChange={(currency) => {
              clearError('currency');
              patch({ currency });
            }}
          />
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField htmlFor="expense-invoice-date" label={expenseFormCopy.invoiceDate} error={errors.invoiceDate}>
          <Input
            id="expense-invoice-date"
            type="date"
            max={today ?? undefined}
            value={form.invoiceDate}
            disabled={submitting}
            onChange={(e) => {
              patch({ invoiceDate: e.target.value });
              clearError('invoiceDate');
            }}
            aria-invalid={errors.invoiceDate ? true : undefined}
            aria-describedby={errors.invoiceDate ? fieldErrorId('expense-invoice-date') : undefined}
            className="tabular-nums"
          />
        </FormField>
        <FormField
          htmlFor="expense-due-date"
          label={expenseFormCopy.dueDate}
          hint={expenseFormCopy.dueDateHint}
          error={errors.dueDate}
        >
          <Input
            id="expense-due-date"
            type="date"
            min={form.invoiceDate || undefined}
            value={form.dueDate}
            disabled={submitting}
            onChange={(e) => {
              patch({ dueDate: e.target.value });
              clearError('dueDate');
            }}
            aria-invalid={errors.dueDate ? true : undefined}
            aria-describedby={errors.dueDate ? fieldErrorId('expense-due-date') : undefined}
            className="tabular-nums"
          />
        </FormField>
      </div>

      {editing ? null : (
        <>
          <SingleFileField
            id="expense-receipt"
            label={expenseFormCopy.receipt}
            hint={expenseFormCopy.receiptHint}
            accept={EXPENSE_RECEIPT_ACCEPT}
            upload={upload}
            disabled={submitting}
            fmt={receiptFormat}
            formatNotice={
              form.locationId && onRetryLocations ? (
                <SedeConfigError kind="locale" variant="note" onRetry={onRetryLocations} locationId={form.locationId} />
              ) : null
            }
          />

          <div className="flex flex-col gap-4 border-t border-hairline pt-4">
            <div className="flex items-start gap-3">
              <input
                id="expense-paid"
                type="checkbox"
                checked={form.paid}
                disabled={submitting}
                onChange={(e) => {
                  patch({ paid: e.target.checked });
                  clearError('paidOn');
                }}
                aria-describedby="expense-paid-hint"
                className="mt-0.5 size-5 shrink-0 accent-[var(--color-primary)]"
              />
              <div className="flex min-w-0 flex-col gap-0.5">
                <label htmlFor="expense-paid" className="text-sm font-medium text-ink">
                  {expenseFormCopy.paid}
                </label>
                <p id="expense-paid-hint" className="text-xs text-muted">
                  {expenseFormCopy.paidHint}
                </p>
              </div>
            </div>
            {form.paid ? (
              <ExpensePaymentFields
                idPrefix="expense-payment"
                value={form.payment}
                onChange={(payment) => {
                  patch({ payment });
                  clearError('paidOn');
                }}
                today={today ?? ''}
                paidOnErrorText={errors.paidOn}
                disabled={submitting}
              />
            ) : null}
          </div>
        </>
      )}
    </FormModal>
  );
}
