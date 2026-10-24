'use client';
import * as React from 'react';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  createExpenseCategory,
  retireExpenseCategory,
  type ExpenseCategory,
} from '@/lib/expenses/expense-categories-api';
import { collapseSpaces } from '@/lib/format/text';
import { EXPENSE_CATEGORY_NAME_MAX, EXPENSE_CATEGORY_NAME_MIN } from '@/lib/expenses/presentation';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';
import { fieldErrorId } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import type { ExpenseCategoriesState } from './use-expense-categories';

export const expenseCategoriesCopy = {
  title: 'Categorías de gasto',
  description:
    'Las predefinidas siempre están. Aquí van las propias de la clínica: al retirar una, los gastos que ya la usan conservan su nombre.',
  listLabel: 'Categorías propias',
  empty: 'Aún no hay categorías propias.',
  // Sin «Intenta de nuevo.»: SectionError trae «Reintentar».
  loadError: 'No pudimos cargar las categorías.',
  nameLabel: 'Nueva categoría',
  namePlaceholder: 'Seguros',
  add: 'Añadir',
  retire: 'Retirar',
  retireLabel: (name: string) => `Retirar la categoría ${name}`,
  nameLength: `Escribe entre ${EXPENSE_CATEGORY_NAME_MIN} y ${EXPENSE_CATEGORY_NAME_MAX} caracteres.`,
  addError: 'No pudimos añadir la categoría. Intenta de nuevo.',
  retireError: 'No pudimos retirar la categoría. Intenta de nuevo.',
  added: (name: string) => `Categoría «${name}» añadida.`,
  retired: (name: string) => `Categoría «${name}» retirada.`,
};

interface ExpenseCategoriesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  categories: ExpenseCategoriesState;
}

/**
 * «Gestionar categorías» (DX-274): alta y retiro de las categorías propias de
 * la clínica. Los fallos se dicen dentro del modal (un toast quedaría debajo).
 */
export function ExpenseCategoriesModal({ open, onOpenChange, token, categories }: ExpenseCategoriesModalProps) {
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [retiringId, setRetiringId] = useState<string | null>(null);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setName('');
      setNameError(null);
      setError(null);
      setNotice(null);
    }
  }

  const own = (categories.categories ?? []).filter(
    (c): c is ExpenseCategory & { id: string } => !c.predefined && typeof c.id === 'string',
  );

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = collapseSpaces(name);
    if (trimmed.length < EXPENSE_CATEGORY_NAME_MIN || trimmed.length > EXPENSE_CATEGORY_NAME_MAX) {
      setNameError(expenseCategoriesCopy.nameLength);
      return;
    }
    setAdding(true);
    setError(null);
    setNotice(null);
    try {
      const created = await createExpenseCategory(token, trimmed);
      setName('');
      setNotice(expenseCategoriesCopy.added(created.name));
      categories.reload();
    } catch (err) {
      setError(apiErrorMessage(err, { fallback: expenseCategoriesCopy.addError }));
    } finally {
      setAdding(false);
    }
  }

  async function retire(category: ExpenseCategory & { id: string }) {
    setRetiringId(category.id);
    setError(null);
    setNotice(null);
    try {
      await retireExpenseCategory(token, category.id);
      setNotice(expenseCategoriesCopy.retired(category.name));
      categories.reload();
    } catch (err) {
      setError(apiErrorMessage(err, { fallback: expenseCategoriesCopy.retireError }));
    } finally {
      setRetiringId(null);
    }
  }

  let list: React.ReactNode;
  if (categories.failed) {
    list = <SectionError description={expenseCategoriesCopy.loadError} onRetry={categories.reload} />;
  } else if (categories.categories === null) {
    list = (
      <div role="status" aria-label="Cargando" className="flex flex-col gap-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  } else if (own.length === 0) {
    list = <p className="text-sm text-muted">{expenseCategoriesCopy.empty}</p>;
  } else {
    list = (
      <ul aria-label={expenseCategoriesCopy.listLabel} className="divide-y divide-hairline rounded-lg border border-border">
        {own.map((category) => (
          <li key={category.id} className="flex min-h-11 items-center justify-between gap-3 px-3 py-1.5">
            <span className="min-w-0 text-sm text-ink [overflow-wrap:anywhere]">{category.name}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              loading={retiringId === category.id}
              disabled={retiringId !== null && retiringId !== category.id}
              aria-label={expenseCategoriesCopy.retireLabel(category.name)}
              onClick={() => void retire(category)}
              className="max-sm:min-h-11"
            >
              {expenseCategoriesCopy.retire}
            </Button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{expenseCategoriesCopy.title}</DialogTitle>
          <DialogDescription>{expenseCategoriesCopy.description}</DialogDescription>
        </DialogHeader>
        {error ? <InlineError variant="summary">{error}</InlineError> : null}
        <p role="status" className={notice ? 'text-sm text-success' : 'sr-only'}>
          {notice}
        </p>
        {list}
        <form onSubmit={(e) => void add(e)} className="flex flex-col gap-1.5">
          <Label htmlFor="expense-category-name">{expenseCategoriesCopy.nameLabel}</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="expense-category-name"
              value={name}
              maxLength={EXPENSE_CATEGORY_NAME_MAX}
              placeholder={expenseCategoriesCopy.namePlaceholder}
              autoComplete="off"
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(null);
              }}
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? fieldErrorId('expense-category-name') : undefined}
            />
            <Button type="submit" variant="secondary" loading={adding} className="shrink-0 max-sm:min-h-11">
              <Plus aria-hidden />
              {expenseCategoriesCopy.add}
            </Button>
          </div>
          {nameError ? (
            <InlineError id={fieldErrorId('expense-category-name')} className="text-xs">
              {nameError}
            </InlineError>
          ) : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}
