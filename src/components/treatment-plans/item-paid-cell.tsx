import { Badge } from '@/components/ui/badge';
import { TableCell } from '@/components/ui/table';
import { formatCurrency } from '@/lib/format/currency';
import type { PlanItemBalance } from '@/lib/payments/payments-api';

export const itemPaidCopy = {
  colPaid: 'Cobrado',
  colPending: 'Pendiente',
  // Nombre accesible del «—» de un ítem sin importe a cobrar (propuesto, o de
  // un plan rechazado o cancelado): un guion solo no le dice nada a un lector.
  notBillable: 'Sin importe a cobrar',
  // Pendiente 0 en un ítem facturable: ya está cubierto. No «Pagado», que en
  // el resumen del plan es la cifra de lo abonado: dos sentidos en la misma
  // pantalla.
  fullyPaid: 'Cubierto',
  line: (paid: string, pending: string) => `Cobrado ${paid} · Pendiente ${pending}`,
  linePaid: (paid: string) => `Cobrado ${paid} ·`,
};

function NotBillable() {
  return (
    <span role="img" aria-label={itemPaidCopy.notBillable} className="text-muted">
      —
    </span>
  );
}

function FullyPaid() {
  return <Badge variant="muted">{itemPaidCopy.fullyPaid}</Badge>;
}

/**
 * Las cifras de un ítem, con las mismas reglas en el plan (ADMIN) y en el
 * «Ver por ítem» del estado de cuenta (recepción): sin importe a cobrar
 * (propuesto, o de un plan rechazado o cancelado) es «—» con nombre
 * accesible, no una fila de ceros que se lee como «gratis»; pendiente 0 en un
 * ítem facturable es la marca «Cubierto».
 */
export function ItemBillableValue({ item, currency }: { item: PlanItemBalance; currency: string }) {
  return item.billable === 0 ? <NotBillable /> : <>{formatCurrency(item.billable, currency)}</>;
}

export function ItemPaidValue({ item, currency }: { item: PlanItemBalance; currency: string }) {
  return item.billable === 0 ? <NotBillable /> : <>{formatCurrency(item.paid, currency)}</>;
}

export function ItemPendingValue({ item, currency }: { item: PlanItemBalance; currency: string }) {
  if (item.billable === 0) return <NotBillable />;
  return item.balance === 0 ? <FullyPaid /> : <>{formatCurrency(item.balance, currency)}</>;
}

/**
 * Columnas «Cobrado» y «Pendiente» de una fila de ítems del plan (DX-051), en
 * la moneda del plan. Sin el saldo del ítem (aún no llegó, o el ítem es más
 * nuevo que la respuesta), dos celdas con «—» para no inventar un cero.
 */
export function ItemPaidCell({ item, currency }: { item: PlanItemBalance | undefined; currency: string }) {
  if (!item) {
    return (
      <>
        <TableCell className="text-right text-muted" data-label={itemPaidCopy.colPaid}>
          —
        </TableCell>
        <TableCell className="text-right text-muted" data-label={itemPaidCopy.colPending}>
          —
        </TableCell>
      </>
    );
  }
  const figures = item.billable === 0 ? 'text-right' : 'text-right tabular-nums';
  return (
    <>
      <TableCell className={figures} data-label={itemPaidCopy.colPaid}>
        <ItemPaidValue item={item} currency={currency} />
      </TableCell>
      <TableCell className={figures} data-label={itemPaidCopy.colPending}>
        <ItemPendingValue item={item} currency={currency} />
      </TableCell>
    </>
  );
}

/** Lo mismo en la tarjeta móvil del ítem: «Cobrado {x} · Pendiente {y}». */
export function ItemPaidLine({ item, currency }: { item: PlanItemBalance | undefined; currency: string }) {
  if (!item) return null;
  if (item.billable === 0) {
    return (
      <p className="text-sm text-muted">
        <NotBillable />
      </p>
    );
  }
  if (item.balance === 0) {
    return (
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted tabular-nums">
        <span>{itemPaidCopy.linePaid(formatCurrency(item.paid, currency))}</span>
        <FullyPaid />
      </p>
    );
  }
  return (
    <p className="text-sm text-muted tabular-nums">
      {itemPaidCopy.line(formatCurrency(item.paid, currency), formatCurrency(item.balance, currency))}
    </p>
  );
}
