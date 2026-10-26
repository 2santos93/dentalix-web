import { Badge } from '@/components/ui/badge';
import type { Expense } from '@/lib/expenses/expenses-api';
import {
  EXPENSE_OVERDUE_LABEL,
  EXPENSE_STATUS_LABELS,
  EXPENSE_STATUS_VARIANT,
  isExpenseOverdue,
} from '@/lib/expenses/presentation';

/** El estado del gasto y, si está por pagar y vencido, «Vencido» al lado. */
export function ExpenseStatusBadges({ expense }: { expense: Pick<Expense, 'status' | 'overdue'> }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Badge variant={EXPENSE_STATUS_VARIANT[expense.status]}>{EXPENSE_STATUS_LABELS[expense.status]}</Badge>
      {isExpenseOverdue(expense) ? <Badge variant="danger">{EXPENSE_OVERDUE_LABEL}</Badge> : null}
    </span>
  );
}
