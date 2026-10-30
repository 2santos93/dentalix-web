'use client';
import { useEffect, useState } from 'react';
import { getPlanBalance, type PlanBalance } from '@/lib/payments/payments-api';
import { allocationCopy } from '@/lib/payments/allocation-copy';
import { ITEM_STATUS_BADGE_VARIANT, ITEM_STATUS_LABELS } from '@/lib/treatment-plans/item-status';
import { sedeMoney } from '@/lib/format/sede-number';
import { readyFormat, useSedeFormat } from '@/lib/locations/use-sede-format';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ItemBillableValue, ItemPaidValue, ItemPendingValue } from '@/components/treatment-plans/item-paid-cell';
import { WithoutRateNotice } from '@/components/payments/without-rate-notice';

const planItemsBalanceCopy = {
  table: 'Cobrado por ítem del plan',
  colProcedure: allocationCopy.colProcedure,
  colTooth: allocationCopy.colTooth,
  colStatus: allocationCopy.colStatus,
  colBillable: 'A pagar',
  colPaid: 'Cobrado',
  colPending: 'Pendiente',
  noTooth: allocationCopy.noTooth,
  empty: 'Este plan todavía no tiene ítems.',
  // Sin "Intenta de nuevo.": SectionError trae su propio botón.
  loadError: 'No pudimos cargar el detalle por ítem.',
};

const copy = planItemsBalanceCopy;

/**
 * El detalle «Ver por ítem» de un plan en el estado de cuenta (DX-051):
 * recepción no abre el plan de tratamiento (clínico), así que aquí ve qué
 * cubre lo cobrado, ítem por ítem, y lo que queda «sin imputar». Solo lectura:
 * reasignar es del ADMIN, desde el plan. Se monta al abrirse el desplegable,
 * así que carga entonces (`GET /treatment-plans/:id/balance`) y no antes. Las
 * cifras van en la moneda que dice el propio saldo (`planCurrency`), con el
 * formato de la sede y el código ISO (DX-386).
 */
export function PlanItemsBalance({ token, planId }: { token: string; planId: string }) {
  const [balance, setBalance] = useState<PlanBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const fmt = readyFormat(useSedeFormat(token));

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await getPlanBalance(token, planId);
        if (cancelled) return;
        setBalance(res);
        setError(null);
      } catch {
        if (cancelled) return;
        setError(copy.loadError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, planId, reloadKey]);

  return (
    <AsyncSection
      loading={loading}
      error={error}
      onRetry={() => setReloadKey((k) => k + 1)}
      skeleton={<TableSkeleton rows={2} />}
    >
      {balance ? (
        <div className="flex flex-col gap-3">
          {balance.items.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              <Table aria-label={copy.table}>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead scope="col">{copy.colProcedure}</TableHead>
                    <TableHead scope="col">{copy.colTooth}</TableHead>
                    <TableHead scope="col">{copy.colStatus}</TableHead>
                    <TableHead scope="col" className="text-right">
                      {copy.colBillable}
                    </TableHead>
                    <TableHead scope="col" className="text-right">
                      {copy.colPaid}
                    </TableHead>
                    <TableHead scope="col" className="text-right">
                      {copy.colPending}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {balance.items.map((item) => (
                    <TableRow key={item.itemId}>
                      <TableCell className="font-medium break-words" data-label={copy.colProcedure}>
                        {item.procedureName}
                      </TableCell>
                      <TableCell className="tabular-nums" data-label={copy.colTooth}>
                        {item.toothNumber || <span className="text-muted">{copy.noTooth}</span>}
                      </TableCell>
                      <TableCell data-label={copy.colStatus}>
                        <Badge variant={ITEM_STATUS_BADGE_VARIANT[item.status]}>
                          {ITEM_STATUS_LABELS[item.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums" data-label={copy.colBillable}>
                        <ItemBillableValue item={item} currency={balance.planCurrency} fmt={fmt} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums" data-label={copy.colPaid}>
                        <ItemPaidValue item={item} currency={balance.planCurrency} fmt={fmt} />
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums" data-label={copy.colPending}>
                        <ItemPendingValue item={item} currency={balance.planCurrency} fmt={fmt} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted">{copy.empty}</p>
          )}
          {balance.unallocated > 0 ? (
            <dl>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <dt className="t-label text-muted">{allocationCopy.unallocated}</dt>
                <dd className="font-medium text-ink tabular-nums">
                  {sedeMoney(balance.unallocated, balance.planCurrency, fmt)}
                </dd>
                <dd className="w-full text-xs text-muted">{allocationCopy.unallocatedHelp}</dd>
              </div>
            </dl>
          ) : null}
          {/* Sin él, Cobrado + Sin imputar no llega a lo «Abonado» del plan y
              nada lo explica. DX-375: si son abonos «sin tasa», el aviso lo
              dice (y cómo resolverlo) en vez de la nota. */}
          {balance.paymentsWithoutRate.length > 0 ? (
            <WithoutRateNotice token={token} payments={balance.paymentsWithoutRate} />
          ) : balance.unconvertedPaymentsCount > 0 ? (
            <p className="text-sm text-muted">{allocationCopy.unconvertedNotice(balance.unconvertedPaymentsCount)}</p>
          ) : null}
        </div>
      ) : null}
    </AsyncSection>
  );
}
