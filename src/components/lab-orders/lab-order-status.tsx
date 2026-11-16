import { daysOverdueLabel, type LabOrder } from '@/lib/lab-orders/lab-orders-api';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';

export const labOrderStatusCopy = {
  overdue: 'Atrasada',
  overdueLine: (days: number | null) => (days === null ? 'Atrasada' : `Atrasada, ${daysOverdueLabel(days)}`),
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

/**
 * La fecha prometida en la tarjeta del teléfono: el chip «Atrasada» no cabe
 * junto al estado sin apretar el nombre, así que el atraso va en rojo en la
 * línea de la fecha («Prometida 13/11/2026 · Atrasada, 3 días de atraso»).
 */
export function LabOrderDueLine({
  order,
  day,
  label,
}: {
  order: Pick<LabOrder, 'overdue' | 'daysOverdue'>;
  day: string | null;
  label: (day: string) => string;
}) {
  if (!day && !order.overdue) return null;
  const parts = [day ? label(day) : null, order.overdue ? labOrderStatusCopy.overdueLine(order.daysOverdue) : null].filter(
    (v): v is string => v !== null,
  );
  return <span className={order.overdue ? 'font-medium text-danger-text' : undefined}>{parts.join(' · ')}</span>;
}
