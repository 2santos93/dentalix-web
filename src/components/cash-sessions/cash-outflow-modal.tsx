'use client';
import * as React from 'react';
import { useCallback, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  createCashOutflow,
  requestExpenseReceiptUpload,
  type CreateCashOutflowInput,
  type ExpenseDetail,
} from '@/lib/expenses/expenses-api';
import { EXPENSE_RECEIPT_ACCEPT, EXPENSE_RECEIPT_RULES } from '@/lib/expenses/presentation';
import type { SingleFileUploadRequest } from '@/lib/files/upload-single-file';
import { formatCurrency } from '@/lib/format/currency';
import { collapseSpaces } from '@/lib/format/text';
import { CurrencySelect } from '@/components/shared/currency-select';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { FormModal } from '@/components/shared/form-modal';
import { MoneyInput } from '@/components/shared/money-input';
import { SingleFileField, useSingleFileUpload } from '@/components/shared/single-file-field';
import {
  ExpenseCategoryField,
  ExpenseDescriptionField,
  ExpenseSupplierField,
  expenseFieldsCopy,
  expenseTextErrors,
  parseExpenseAmount,
  type ExpenseTextErrors,
} from '@/components/expenses/expense-fields';
import { useExpenseCategories } from '@/components/expenses/use-expense-categories';

export const cashOutflowCopy = {
  title: 'Salida de caja',
  description: (sede: string) =>
    `Efectivo que sale del cajón de tu caja en ${sede} para un gasto menor: queda como gasto pagado de la sede y se resta del arqueo.`,
  submit: 'Registrar salida',
  createError: 'No pudimos registrar la salida. Intenta de nuevo.',
  created: (amount: string) => `Salida de caja de ${amount} registrada.`,
};

type FieldErrors = ExpenseTextErrors & { amount?: string };

interface CashOutflowModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  /** La sede de la caja: va en `X-Location-Id`, aunque haya cajas abiertas en otras. */
  locationId: string;
  sedeName: string;
  /** Moneda de la sede, la propuesta. */
  defaultCurrency: string;
  onCreated: (expense: ExpenseDetail, notice: string) => void;
}

/**
 * «Salida de caja» (DX-274, R1/R8): un gasto menor pagado en efectivo desde
 * MI caja abierta, para ADMIN y recepción. La API crea el gasto y su pago en
 * una transacción y no devuelve el esperado (arqueo ciego, R6). Se monta con
 * `key` por apertura: clave de idempotencia nueva cada vez y la misma en cada
 * reintento del mismo envío.
 */
export function CashOutflowModal({
  open,
  onOpenChange,
  token,
  locationId,
  sedeName,
  defaultCurrency,
  onCreated,
}: CashOutflowModalProps) {
  const categories = useExpenseCategories(token, open);
  const [category, setCategory] = useState('');
  const [supplier, setSupplier] = useState('');
  const [description, setDescription] = useState('');
  const [amountText, setAmountText] = useState('');
  const [currency, setCurrency] = useState(defaultCurrency);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const requestTicket = useCallback(
    (request: SingleFileUploadRequest) => requestExpenseReceiptUpload(token, request),
    [token],
  );
  const upload = useSingleFileUpload(EXPENSE_RECEIPT_RULES, requestTicket);

  function clearError(field: keyof FieldErrors) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const { amount, error: amountError } = parseExpenseAmount(amountText, currency);
    const next: FieldErrors = { ...expenseTextErrors({ category, supplier, description }), amount: amountError };
    setErrors(next);
    if (Object.values(next).some(Boolean) || amount === null) return;
    if (upload.state.status === 'error' && upload.state.file) {
      setError(expenseFieldsCopy.receiptPending);
      return;
    }
    const cleanSupplier = collapseSpaces(supplier);
    const cleanDescription = description.trim();
    const body: CreateCashOutflowInput = {
      category,
      ...(cleanSupplier ? { supplier: cleanSupplier } : {}),
      ...(cleanDescription ? { description: cleanDescription } : {}),
      amount,
      currency,
      ...(upload.uploadId ? { attachmentUploadId: upload.uploadId } : {}),
    };
    setSubmitting(true);
    try {
      const created = await createCashOutflow(token, body, idempotencyKey, locationId);
      onCreated(created, cashOutflowCopy.created(formatCurrency(amount, currency)));
      onOpenChange(false);
    } catch (err) {
      // La clave no cambia: reintentar esta misma salida no la duplica. Los
      // 409 (sin caja abierta en la sede…) llegan con el texto de la API.
      setError(apiErrorMessage(err, { fallback: cashOutflowCopy.createError }));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={cashOutflowCopy.title}
      description={cashOutflowCopy.description(sedeName || '…')}
      onSubmit={(e) => void handleSubmit(e)}
      submitLabel={cashOutflowCopy.submit}
      submitting={submitting}
      submitDisabled={upload.busy}
      error={error}
      size="lg"
    >
      <ExpenseCategoryField
        id="outflow-category"
        value={category}
        onChange={(next) => {
          setCategory(next);
          clearError('category');
        }}
        categories={categories}
        error={errors.category}
        disabled={submitting}
      />

      <ExpenseSupplierField
        id="outflow-supplier"
        token={token}
        enabled={open}
        value={supplier}
        onChange={(next) => {
          setSupplier(next);
          clearError('supplier');
        }}
        error={errors.supplier}
        disabled={submitting}
      />

      <ExpenseDescriptionField
        id="outflow-description"
        value={description}
        onChange={(next) => {
          setDescription(next);
          clearError('description');
        }}
        error={errors.description}
        disabled={submitting}
      />

      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <FormField htmlFor="outflow-amount" label={expenseFieldsCopy.amount} error={errors.amount}>
          <MoneyInput
            id="outflow-amount"
            currency={currency}
            requirePositive
            value={amountText}
            disabled={submitting}
            onValueChange={(next) => {
              setAmountText(next);
              clearError('amount');
            }}
            aria-invalid={errors.amount ? true : undefined}
            aria-describedby={errors.amount ? fieldErrorId('outflow-amount') : undefined}
          />
        </FormField>
        <FormField htmlFor="outflow-currency" label={expenseFieldsCopy.currency}>
          <CurrencySelect
            id="outflow-currency"
            token={token}
            value={currency}
            disabled={submitting}
            onChange={setCurrency}
          />
        </FormField>
      </div>

      <SingleFileField
        id="outflow-receipt"
        label={expenseFieldsCopy.receipt}
        hint={expenseFieldsCopy.receiptHint}
        accept={EXPENSE_RECEIPT_ACCEPT}
        upload={upload}
        disabled={submitting}
      />
    </FormModal>
  );
}
