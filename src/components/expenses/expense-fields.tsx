'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { suggestExpenseSuppliers } from '@/lib/expenses/expenses-api';
import { EXPENSE_DESCRIPTION_MAX, EXPENSE_SUPPLIER_MAX } from '@/lib/expenses/presentation';
import { parseMoneyInput } from '@/lib/format/money';
import { collapseSpaces } from '@/lib/format/text';
import { FieldError } from '@/components/errors/field-error';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import type { ExpenseCategoriesState } from './use-expense-categories';

/*
 * Los campos que comparten el alta de un gasto y la salida de caja (DX-274):
 * categoría, proveedor con sugerencias y descripción, con sus límites, y los
 * textos del importe y del soporte.
 */

export const expenseFieldsCopy = {
  category: 'Categoría',
  categoryPlaceholder: 'Elige una categoría',
  categoriesLoading: 'Cargando categorías…',
  categoriesError: 'Categorías no disponibles',
  supplier: 'Proveedor',
  supplierHint: 'Opcional. Te sugerimos los que ya usaste.',
  description: 'Descripción',
  amount: 'Importe',
  currency: 'Moneda',
  receipt: 'Soporte',
  receiptHint: 'PDF, JPG, PNG o foto HEIC, hasta 20 MB. Opcional.',
  receiptPending: 'El soporte no se subió: reintenta la subida o quítalo antes de guardar.',
  amountRequired: 'Escribe un importe mayor que 0.',
  categoryRequired: 'Elige una categoría.',
  supplierTooLong: `El proveedor admite hasta ${EXPENSE_SUPPLIER_MAX} caracteres.`,
  descriptionTooLong: `La descripción admite hasta ${EXPENSE_DESCRIPTION_MAX} caracteres.`,
};

const SUPPLIER_DEBOUNCE_MS = 300;

export type ExpenseTextErrors = Partial<Record<'category' | 'supplier' | 'description', string>>;

/** Lo que falta o sobra en categoría, proveedor y descripción. */
export function expenseTextErrors(form: { category: string; supplier: string; description: string }): ExpenseTextErrors {
  const errors: ExpenseTextErrors = {};
  if (!form.category) errors.category = expenseFieldsCopy.categoryRequired;
  if (collapseSpaces(form.supplier).length > EXPENSE_SUPPLIER_MAX) errors.supplier = expenseFieldsCopy.supplierTooLong;
  if (form.description.trim().length > EXPENSE_DESCRIPTION_MAX) errors.description = expenseFieldsCopy.descriptionTooLong;
  return errors;
}

/** El importe de un gasto: mayor que 0, con los decimales de su moneda. */
export function parseExpenseAmount(
  text: string,
  currency: string,
): { amount: number; error?: undefined } | { amount: null; error: string } {
  const parsed = parseMoneyInput(text, currency);
  if (!parsed.ok) return { amount: null, error: parsed.reason === 'empty' ? expenseFieldsCopy.amountRequired : parsed.message };
  if (parsed.value <= 0) return { amount: null, error: expenseFieldsCopy.amountRequired };
  return { amount: parsed.value };
}

interface ExpenseCategoryFieldProps {
  id: string;
  value: string;
  onChange: (category: string) => void;
  categories: ExpenseCategoriesState;
  error?: string;
  disabled?: boolean;
  /** Bajo el control, p. ej. «Gestionar categorías». */
  children?: React.ReactNode;
}

/** Predefinidas y propias activas; la ya elegida sigue elegible aunque se haya retirado. */
export function ExpenseCategoryField({ id, value, onChange, categories, error, disabled = false, children }: ExpenseCategoryFieldProps) {
  const names = (categories.categories ?? []).map((c) => c.name);
  if (value && !names.includes(value)) names.unshift(value);
  return (
    <FormField htmlFor={id} label={expenseFieldsCopy.category} error={error}>
      {categories.failed ? (
        <FieldError
          label={expenseFieldsCopy.categoriesError}
          onRetry={categories.reload}
          className="h-10 w-full"
          retryId={id}
        />
      ) : (
        <NativeSelect
          id={id}
          value={value}
          disabled={disabled || categories.categories === null}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? fieldErrorId(id) : undefined}
        >
          <option value="">
            {categories.categories === null ? expenseFieldsCopy.categoriesLoading : expenseFieldsCopy.categoryPlaceholder}
          </option>
          {names.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </NativeSelect>
      )}
      {children}
    </FormField>
  );
}

interface ExpenseSupplierFieldProps {
  id: string;
  token: string;
  /** Pide sugerencias solo con el modal abierto. */
  enabled: boolean;
  value: string;
  onChange: (supplier: string) => void;
  error?: string;
  disabled?: boolean;
}

/** Texto libre con los proveedores ya usados como sugerencia; si fallan, sigue siendo libre. */
export function ExpenseSupplierField({ id, token, enabled, value, onChange, error, disabled = false }: ExpenseSupplierFieldProps) {
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const query = collapseSpaces(value);
  useEffect(() => {
    if (!enabled || !token) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      suggestExpenseSuppliers(token, query)
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
  }, [enabled, token, query]);

  const hintId = `${id}-hint`;
  const listId = `${id}-options`;
  return (
    <FormField htmlFor={id} label={expenseFieldsCopy.supplier} hint={expenseFieldsCopy.supplierHint} hintId={hintId} error={error}>
      <Input
        id={id}
        list={listId}
        value={value}
        maxLength={EXPENSE_SUPPLIER_MAX}
        autoComplete="off"
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? fieldErrorId(id) : hintId}
      />
      <datalist id={listId}>
        {suppliers.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </FormField>
  );
}

interface ExpenseDescriptionFieldProps {
  id: string;
  value: string;
  onChange: (description: string) => void;
  error?: string;
  disabled?: boolean;
}

export function ExpenseDescriptionField({ id, value, onChange, error, disabled = false }: ExpenseDescriptionFieldProps) {
  return (
    <FormField htmlFor={id} label={expenseFieldsCopy.description} error={error}>
      <Textarea
        id={id}
        rows={2}
        autoGrow
        value={value}
        maxLength={EXPENSE_DESCRIPTION_MAX}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? fieldErrorId(id) : undefined}
        className="max-h-48"
      />
    </FormField>
  );
}
