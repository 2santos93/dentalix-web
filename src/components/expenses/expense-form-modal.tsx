'use client';
import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Settings2 } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  createExpense,
  requestExpenseReceiptUpload,
  suggestExpenseSuppliers,
  updateExpense,
  type CreateExpenseInput,
  type ExpenseDetail,
  type UpdateExpenseInput,
} from '@/lib/expenses/expenses-api';
import {
  EXPENSE_DESCRIPTION_MAX,
  EXPENSE_RECEIPT_ACCEPT,
  EXPENSE_RECEIPT_RULES,
  EXPENSE_SUPPLIER_MAX,
} from '@/lib/expenses/presentation';
import type { SingleFileUploadRequest } from '@/lib/files/upload-single-file';
import { formatCurrency } from '@/lib/format/currency';
import { moneyInputText, parseMoneyInput } from '@/lib/format/money';
import { COUNTRY_CURRENCY } from '@/lib/locations/clinic-currency';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { sedeToday } from '@/lib/locations/use-sede-time-zone';
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
  ExpensePaymentFields,
  paidOnError,
  paymentBody,
  type ExpensePaymentValue,
} from './expense-payment-fields';
import type { ExpenseCategoriesState } from './use-expense-categories';

export const expenseFormCopy = {
  createTitle: 'Nuevo gasto',
  createDescription:
    'Lo que la sede gastó: categoría, proveedor, importe y fechas de la factura. Si ya se pagó, regístralo aquí mismo.',
  editTitle: 'Editar gasto',
  editDescription: 'Los pagos no cambian. Para corregir uno, anúlalo y regístralo de nuevo.',
  create: 'Registrar gasto',
  save: 'Guardar cambios',
  location: 'Sede',
  category: 'Categoría',
  categoryPlaceholder: 'Elige una categoría',
  categoriesLoading: 'Cargando categorías…',
  categoriesError: 'Categorías no disponibles',
  manageCategories: 'Gestionar categorías',
  supplier: 'Proveedor',
  supplierHint: 'Opcional. Te sugerimos los que ya usaste.',
  description: 'Descripción',
  amount: 'Importe',
  currency: 'Moneda',
  invoiceDate: 'Fecha de factura',
  dueDate: 'Vencimiento',
  dueDateHint: 'Opcional.',
  receipt: 'Soporte',
  receiptHint: 'PDF, JPG, PNG o foto HEIC, hasta 20 MB. Opcional.',
  paid: 'Ya está pagado',
  paidHint: 'Registra el pago completo junto con el gasto.',
  lockedByPayments: 'Con pagos registrados, la sede y la moneda no cambian.',
  amountMin: (paid: string) => `No puede ser menor que lo ya pagado (${paid}).`,
  categoryRequired: 'Elige una categoría.',
  amountRequired: 'Escribe un importe mayor que 0.',
  invoiceDateRequired: 'Elige la fecha de la factura.',
  invoiceDateFuture: 'La fecha de la factura no puede ser futura.',
  dueBeforeInvoice: 'El vencimiento no puede ser anterior a la fecha de la factura.',
  supplierTooLong: `El proveedor admite hasta ${EXPENSE_SUPPLIER_MAX} caracteres.`,
  descriptionTooLong: `La descripción admite hasta ${EXPENSE_DESCRIPTION_MAX} caracteres.`,
  receiptPending: 'El soporte no se subió: reintenta la subida o quítalo antes de guardar.',
  createError: 'No pudimos registrar el gasto. Intenta de nuevo.',
  saveError: 'No pudimos guardar los cambios. Intenta de nuevo.',
  created: 'Gasto registrado.',
  saved: 'Gasto actualizado.',
};

const SUPPLIER_DEBOUNCE_MS = 300;

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

type FieldErrors = Partial<Record<'category' | 'amount' | 'invoiceDate' | 'dueDate' | 'supplier' | 'description' | 'paidOn', string>>;

function currencyOf(location: ClinicLocation | undefined): string {
  return location ? COUNTRY_CURRENCY[location.country] : '';
}

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
  const today = sedeToday(location?.timeZone ?? null);
  return {
    locationId: location?.id ?? '',
    category: '',
    supplier: '',
    description: '',
    amount: '',
    currency: currencyOf(location),
    invoiceDate: today,
    dueDate: '',
    paid: false,
    payment: { method: 'CASH', paidOn: today, fromCashSession: false },
  };
}

/** Texto libre recortado, con los espacios repetidos juntos, como la API. */
function clean(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

interface ExpenseFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  /** Sedes activas de la clínica, la principal primero. */
  locations: ClinicLocation[];
  /** La sede activa del selector, o null en «Todas las sedes». */
  defaultLocationId: string | null;
  categories: ExpenseCategoriesState;
  onManageCategories: () => void;
  /** Para editar; sin él, alta. */
  expense?: ExpenseDetail;
  onSaved: (expense: ExpenseDetail, notice: string) => void;
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
  locations,
  defaultLocationId,
  categories,
  onManageCategories,
  expense,
  onSaved,
}: ExpenseFormModalProps) {
  const editing = expense !== undefined;
  const hasPayments = (expense?.payments.length ?? 0) > 0;
  const [form, setForm] = useState<FormState>(() => initialState(locations, defaultLocationId, expense));
  const [currencyTouched, setCurrencyTouched] = useState(editing);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [suppliers, setSuppliers] = useState<string[]>([]);

  const requestTicket = useCallback(
    (request: SingleFileUploadRequest) => requestExpenseReceiptUpload(token, request),
    [token],
  );
  const upload = useSingleFileUpload(EXPENSE_RECEIPT_RULES, requestTicket);

  // Las sedes llegan después de abrir: sin sede elegida, la propuesta.
  const [prevLocations, setPrevLocations] = useState(locations);
  if (locations !== prevLocations) {
    setPrevLocations(locations);
    if (!form.locationId && locations.length > 0) {
      // Solo lo que depende de la sede: lo ya escrito se queda.
      const proposed = initialState(locations, defaultLocationId, expense);
      setForm((f) => ({
        ...f,
        locationId: proposed.locationId,
        currency: currencyTouched ? f.currency : proposed.currency,
        invoiceDate: proposed.invoiceDate,
        payment: { ...f.payment, paidOn: proposed.payment.paidOn },
      }));
    }
  }

  const location = locations.find((l) => l.id === form.locationId);
  const today = sedeToday(location?.timeZone ?? null);

  // Sugerencias de proveedor al teclear; si fallan, el campo sigue siendo libre.
  const supplierQuery = clean(form.supplier);
  useEffect(() => {
    if (!open || !token) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      suggestExpenseSuppliers(token, supplierQuery)
        .then((names) => {
          if (!cancelled) setSuppliers(names);
        })
        .catch(() => {
          /* sin sugerencias */
        });
    }, SUPPLIER_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, token, supplierQuery]);

  function patch(next: Partial<FormState>) {
    setForm((f) => ({ ...f, ...next }));
  }

  function clearError(field: keyof FieldErrors) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function changeLocation(locationId: string) {
    const next = locations.find((l) => l.id === locationId);
    const nextToday = sedeToday(next?.timeZone ?? null);
    setForm((f) => ({
      ...f,
      locationId,
      // La moneda sigue a la sede mientras nadie la haya elegido a mano.
      currency: currencyTouched ? f.currency : currencyOf(next) || f.currency,
      payment: f.payment.paidOn > nextToday ? { ...f.payment, paidOn: nextToday } : f.payment,
    }));
  }

  function validate(): { next: FieldErrors; amount: number | null } {
    const next: FieldErrors = {};
    if (!form.category) next.category = expenseFormCopy.categoryRequired;
    const parsed = parseMoneyInput(form.amount, form.currency);
    let amount: number | null = null;
    if (!parsed.ok) next.amount = parsed.reason === 'empty' ? expenseFormCopy.amountRequired : parsed.message;
    else if (parsed.value <= 0) next.amount = expenseFormCopy.amountRequired;
    else amount = parsed.value;
    if (amount !== null && expense && Math.round(amount * 100) < Math.round(expense.paidAmount * 100)) {
      next.amount = expenseFormCopy.amountMin(formatCurrency(expense.paidAmount, expense.currency));
    }
    if (!form.invoiceDate) next.invoiceDate = expenseFormCopy.invoiceDateRequired;
    else if (form.invoiceDate > today) next.invoiceDate = expenseFormCopy.invoiceDateFuture;
    if (form.dueDate && form.invoiceDate && form.dueDate < form.invoiceDate) {
      next.dueDate = expenseFormCopy.dueBeforeInvoice;
    }
    if (clean(form.supplier).length > EXPENSE_SUPPLIER_MAX) next.supplier = expenseFormCopy.supplierTooLong;
    if (form.description.trim().length > EXPENSE_DESCRIPTION_MAX) {
      next.description = expenseFormCopy.descriptionTooLong;
    }
    if (!editing && form.paid) {
      const paidOn = paidOnError(form.payment, today);
      if (paidOn) next.paidOn = paidOn;
    }
    return { next, amount };
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const { next, amount } = validate();
    setErrors(next);
    if (Object.values(next).some(Boolean) || amount === null) return;
    if (upload.state.status === 'error' && upload.state.file) {
      setError(expenseFormCopy.receiptPending);
      return;
    }
    const supplier = clean(form.supplier);
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

  const options = categories.categories ?? [];
  // Editando un gasto con una categoría ya retirada, sigue elegible la suya.
  const categoryNames = options.map((c) => c.name);
  if (form.category && !categoryNames.includes(form.category)) categoryNames.unshift(form.category);

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? expenseFormCopy.editTitle : expenseFormCopy.createTitle}
      description={editing ? expenseFormCopy.editDescription : expenseFormCopy.createDescription}
      onSubmit={(e) => void handleSubmit(e)}
      submitLabel={editing ? expenseFormCopy.save : expenseFormCopy.create}
      submitting={submitting}
      submitDisabled={upload.busy || !form.locationId}
      error={error}
      size="lg"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          htmlFor="expense-location"
          label={expenseFormCopy.location}
          hint={hasPayments ? expenseFormCopy.lockedByPayments : undefined}
          hintId="expense-location-hint"
        >
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
        </FormField>
        <FormField htmlFor="expense-category" label={expenseFormCopy.category} error={errors.category}>
          {categories.failed ? (
            <FieldError
              label={expenseFormCopy.categoriesError}
              onRetry={categories.reload}
              className="h-10 w-full"
              retryId="expense-category"
            />
          ) : (
            <select
              id="expense-category"
              value={form.category}
              disabled={submitting || categories.categories === null}
              onChange={(e) => {
                patch({ category: e.target.value });
                clearError('category');
              }}
              aria-invalid={errors.category ? true : undefined}
              aria-describedby={errors.category ? fieldErrorId('expense-category') : undefined}
              className={cn(fieldClass, 'h-10')}
            >
              <option value="">
                {categories.categories === null ? expenseFormCopy.categoriesLoading : expenseFormCopy.categoryPlaceholder}
              </option>
              {categoryNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          )}
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
        </FormField>
      </div>

      <FormField
        htmlFor="expense-supplier"
        label={expenseFormCopy.supplier}
        hint={expenseFormCopy.supplierHint}
        hintId="expense-supplier-hint"
        error={errors.supplier}
      >
        <Input
          id="expense-supplier"
          list="expense-supplier-options"
          value={form.supplier}
          maxLength={EXPENSE_SUPPLIER_MAX}
          autoComplete="off"
          disabled={submitting}
          onChange={(e) => {
            patch({ supplier: e.target.value });
            clearError('supplier');
          }}
          aria-invalid={errors.supplier ? true : undefined}
          aria-describedby={errors.supplier ? fieldErrorId('expense-supplier') : 'expense-supplier-hint'}
        />
        <datalist id="expense-supplier-options">
          {suppliers.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </FormField>

      <FormField htmlFor="expense-description" label={expenseFormCopy.description} error={errors.description}>
        <textarea
          id="expense-description"
          rows={2}
          value={form.description}
          maxLength={EXPENSE_DESCRIPTION_MAX}
          disabled={submitting}
          onChange={(e) => {
            patch({ description: e.target.value });
            clearError('description');
          }}
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={errors.description ? fieldErrorId('expense-description') : undefined}
          className={fieldClass}
        />
      </FormField>

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
        <FormField htmlFor="expense-currency" label={expenseFormCopy.currency}>
          <CurrencySelect
            id="expense-currency"
            token={token}
            value={form.currency}
            disabled={submitting || hasPayments}
            onChange={(currency) => {
              setCurrencyTouched(true);
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
            max={today}
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
                today={today}
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
