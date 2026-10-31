import { StatusBadge } from '@/components/ui/status-badge';
import { Badge } from '@/components/ui/badge';
import type { Expense } from '@/lib/expenses/expenses-api';
import {
  EXPENSE_OVERDUE_LABEL,
  EXPENSE_STATUS_LABELS,
  isExpenseOverdue,
} from '@/lib/expenses/presentation';

/**
 * El estado del gasto. Uno por pagar y vencido es UN chip compuesto en peligro
 * («Parcial · vencido»): dos chips sueltos partían la columna en dos líneas y
 * el vencimiento es lo urgente, así que manda el tono.
 */
export function ExpenseStatusBadges({ expense }: { expense: Pick<Expense, 'status' | 'overdue'> }) {
  if (isExpenseOverdue(expense)) {
    return (
      <Badge variant="danger" dot data-status={expense.status} data-overdue="true">
        {`${EXPENSE_STATUS_LABELS[expense.status]} · ${EXPENSE_OVERDUE_LABEL.toLowerCase()}`}
      </Badge>
    );
  }
  return <StatusBadge kind="expense" status={expense.status} />;
}
