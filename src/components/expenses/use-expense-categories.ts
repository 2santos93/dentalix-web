'use client';
import { useCallback, useEffect, useState } from 'react';
import { listExpenseCategories, type ExpenseCategory } from '@/lib/expenses/expense-categories-api';

export interface ExpenseCategoriesState {
  /** null mientras carga. */
  categories: ExpenseCategory[] | null;
  failed: boolean;
  reload: () => void;
}

/** Predefinidas + propias activas de la clínica, para elegir y para filtrar. */
export function useExpenseCategories(token: string, enabled = true): ExpenseCategoriesState {
  const [categories, setCategories] = useState<ExpenseCategory[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!token || !enabled) return;
    let cancelled = false;
    listExpenseCategories(token)
      .then((data) => {
        if (cancelled) return;
        setCategories(data);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token, enabled, attempt]);

  const reload = useCallback(() => {
    setFailed(false);
    setAttempt((n) => n + 1);
  }, []);

  return { categories, failed, reload };
}
