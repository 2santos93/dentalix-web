import { daysOverdueLabel, type LabOrder } from '@/lib/lab-orders/lab-orders-api';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';

export const labOrderStatusCopy = {
  overdue: 'Atrasada',
};

/**
 * El estado de una orden de laboratorio (DX-017): el chip del estado, que sale
 * de sus fechas en la API, y, si la fecha prometida pasó sin recibirla, el chip
 * rojo «Atrasada» con los días de atraso (el color nunca es la única pista).
 */
export function LabOrderStatusChips({ order }: { order: Pick<LabOrder, 'status' | 'overdue' | 'daysOverdue'> }) {
  return (
    <span data-status={order.status} className="inline-flex flex-wrap items-center gap-1.5">
      <StatusBadge kind="labOrder" status={order.status} />
      {order.overdue ? (
        <Badge variant="danger" dot>
          {labOrderStatusCopy.overdue}
          {order.daysOverdue !== null ? ` · ${daysOverdueLabel(order.daysOverdue)}` : ''}
        </Badge>
      ) : null}
    </span>
  );
}
