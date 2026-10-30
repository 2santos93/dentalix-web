import { StatusBadge } from '@/components/ui/status-badge';
import { Badge } from '@/components/ui/badge';
import type { Expense } from '@/lib/expenses/expenses-api';
import {
  EXPENSE_OVERDUE_LABEL,
  isExpenseOverdue
} from '@/lib/expenses/presentation';

/** El estado del gasto y, si está por pagar y vencido, «Vencido» al lado. */
export function ExpenseStatusBadges({ expense }: { expense: Pick<Expense, 'status' | 'overdue'> }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <StatusBadge kind="expense" status={expense.status} />
      {isExpenseOverdue(expense) ? <Badge variant="danger">{EXPENSE_OVERDUE_LABEL}</Badge> : null}
    </span>
  );
}
