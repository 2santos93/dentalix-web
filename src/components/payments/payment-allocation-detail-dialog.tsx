'use client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { DescriptionItem, DescriptionList } from '@/components/ui/description-list';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { AsyncSection } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { allocationCopy, allocationRule } from '@/lib/payments/allocation-copy';
import type { PaymentAllocations } from '@/lib/payments/payment-allocations-api';
import { PLAN_STATUS_LABELS, isPlanBillable } from '@/lib/treatment-plans/plan-status';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { usePaymentAllocations } from './use-payment-allocations';

// Copy como constantes (i18n-ready), igual que el resto de vistas.
const copy = {
  title: 'Imputación del abono',
  description: 'A qué ítems del plan se aplicó este abono, con cuánto y con qué regla.',
  list: 'Ítems a los que se imputó el abono',
  colItem: 'Ítem',
  colAmount: 'Imputado',
  tooth: (tooth: string) => `Diente ${tooth}`,
  unknownItem: 'Ítem del plan',
  summary: 'Resumen de la imputación',
  payment: 'Abono',
  allocated: 'Imputado',
  rule: 'Regla',
  converted: (amount: string, date: string) => `Convertido de ${amount} con la tasa del ${date}.`,
  noRate: 'No hay tasa de cambio para la fecha de este abono: todavía no se imputa a ningún ítem.',
  notBillable: (status: string) => `El plan está «${status}»: sus abonos no se imputan a ítems.`,
  migratedTitle: 'Este abono no se imputa a ítems',
  close: 'Cerrar',
  change: 'Cambiar imputación',
  loadingLabel: 'Cargando la imputación',
};

interface LineRow {
  id: string;
  /** null = la fila «A cuenta». */
  itemId: string | null;
  procedure: string;
  tooth: string | null;
  amount: number;
}

/** Recibo · importe · fecha civil del abono, con el formato de SU sede. */
function subject(data: PaymentAllocations, stamp: ReturnType<typeof useSedeStamp>): string {
  return [
    data.receiptNumber,
    stamp.money(data.paymentAmount, data.paymentCurrency, data.locationId),
    stamp.civilDate(data.paidOn, data.locationId),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Las líneas imputadas, en el orden del plan, más «A cuenta» si queda algo sin imputar. */
export function allocationRows(data: PaymentAllocations): LineRow[] {
  const items = new Map(data.items.map((item) => [item.itemId, item]));
  const rows: LineRow[] = data.allocations.map((line) => {
    const item = items.get(line.treatmentPlanItemId);
    return {
      id: line.treatmentPlanItemId,
      itemId: line.treatmentPlanItemId,
      procedure: item?.procedureName ?? copy.unknownItem,
      tooth: item ? item.toothNumber || allocationCopy.noTooth : null,
      amount: line.amount,
    };
  });
  if (data.unallocated !== null && data.unallocated > 0) {
    rows.push({
      id: 'on-account',
      itemId: null,
      procedure: allocationCopy.onAccount,
      tooth: null,
      amount: data.unallocated,
    });
  }
  return rows;
}

interface PaymentAllocationDetailDialogProps {
  token: string;
  /** El abono, o `null` para tener el diálogo cerrado. */
  paymentId: string | null;
  onOpenChange: (open: boolean) => void;
  /** Solo ADMIN: pasa a «Imputar abono» para cambiarla. */
  onChange?: (paymentId: string) => void;
}

/**
 * «Imputación del abono» (DX-399), de solo lectura: a qué ítems del plan se
 * aplicó cada importe, la regla con que se imputó («Automática (más antiguo
 * primero)» o «Manual») y lo que queda «A cuenta». Lo abren el plan de
 * tratamiento (ADMIN) y el estado de cuenta (ADMIN y recepción). Importes con
 * el código ISO y el formato de la sede del abono.
 */
export function PaymentAllocationDetailDialog({
  token,
  paymentId,
  onOpenChange,
  onChange,
}: PaymentAllocationDetailDialogProps) {
  return (
    <Dialog open={paymentId !== null} onOpenChange={onOpenChange}>
      {paymentId !== null ? (
        <DialogContent className="max-w-xl gap-3 p-4 sm:p-6" fullScreenOnMobile>
          <Body
            key={paymentId}
            token={token}
            paymentId={paymentId}
            onClose={() => onOpenChange(false)}
            onChange={onChange}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function Body({
  token,
  paymentId,
  onClose,
  onChange,
}: {
  token: string;
  paymentId: string;
  onClose: () => void;
  onChange?: (paymentId: string) => void;
}) {
  const { data, loading, error, errorStatus, reload } = usePaymentAllocations(token, paymentId);
  const stamp = useSedeStamp(token, [data?.locationId]);
  const sedeId = data?.locationId;
  const money = (amount: number, currency: string) => stamp.money(amount, currency, sedeId);
  const rule = data ? allocationRule(data.manual) : null;
  const billable = data ? isPlanBillable(data.planStatus) : true;
  const canChange = onChange !== undefined && data !== null && billable && data.planAmount !== null;

  const columns: DataListColumn<LineRow>[] = [
    {
      id: 'item',
      header: copy.colItem,
      mobile: 'primary',
      cell: (row) =>
        row.itemId === null ? (
          <span className="flex flex-col">
            <span className="font-medium text-ink">{row.procedure}</span>
            <span className="t-caption text-muted">{allocationCopy.onAccountHelp}</span>
          </span>
        ) : (
          <span className="font-medium text-ink break-words">{row.procedure}</span>
        ),
      mobileCell: (row) => row.procedure,
    },
    {
      id: 'tooth',
      header: allocationCopy.colTooth,
      cell: (row) => (row.tooth ? <span className="tabular-nums">{row.tooth}</span> : null),
      mobileCell: (row) =>
        row.itemId === null
          ? allocationCopy.onAccountHelp
          : row.tooth && /^\d/.test(row.tooth)
            ? copy.tooth(row.tooth)
            : row.tooth,
    },
    {
      id: 'amount',
      header: copy.colAmount,
      numeric: true,
      mobile: 'trailing',
      headerClassName: 'whitespace-nowrap',
      cell: (row) => <span className="font-medium text-ink">{data ? money(row.amount, data.planCurrency) : null}</span>,
    },
  ];

  return (
    <>
      <DialogHeader>
        <DialogTitle>{copy.title}</DialogTitle>
        <DialogDescription>{data ? subject(data, stamp) : copy.description}</DialogDescription>
      </DialogHeader>
      {error && errorStatus === 409 ? (
        // Un abono a un saldo migrado no se imputa a ítems: es un dato, no un fallo; sin «Reintentar».
        <EmptyState role="status" size="inline" title={copy.migratedTitle} description={error} />
      ) : (
        <AsyncSection
          loading={loading}
          error={error}
          onRetry={reload}
          skeleton={
            <div className="flex flex-col gap-3" role="status" aria-label={copy.loadingLabel}>
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-24 w-full" />
            </div>
          }
        >
          {data && rule ? (
            <div className="flex flex-col gap-4">
              <SedeStampNote stamp={stamp} />
              <div className="flex flex-col gap-1">
                <p className="flex flex-wrap items-center gap-2 text-sm text-ink">
                  <span className="text-muted">{copy.rule}</span>
                  <Badge variant={data.manual ? 'neutral' : 'info'}>{rule.label}</Badge>
                </p>
                <p className="text-sm text-muted">{rule.help}</p>
                {data.paymentCurrency !== data.planCurrency && data.planAmount !== null ? (
                  <p className="text-sm text-muted tabular-nums">
                    {copy.converted(
                      money(data.paymentAmount, data.paymentCurrency),
                      stamp.civilDate(data.paidOn, sedeId),
                    )}
                  </p>
                ) : null}
              </div>

              {!billable ? (
                <p className="text-sm text-muted">{copy.notBillable(PLAN_STATUS_LABELS[data.planStatus])}</p>
              ) : data.planAmount === null ? (
                <p className="text-sm text-muted">{copy.noRate}</p>
              ) : (
                <>
                  <DataList
                    label={copy.list}
                    rows={allocationRows(data)}
                    columns={columns}
                    getRowKey={(row) => row.id}
                    empty={
                      <EmptyState
                        size="inline"
                        role="status"
                        title={allocationCopy.onAccount}
                        description={allocationCopy.onAccountHelp}
                      />
                    }
                  />
                  <DescriptionList
                    layout="inline"
                    aria-label={copy.summary}
                    className="border-t border-border-subtle pt-3"
                  >
                    <DescriptionItem label={copy.payment} numeric>
                      {money(data.planAmount, data.planCurrency)}
                    </DescriptionItem>
                    <DescriptionItem label={copy.allocated} numeric>
                      {money(data.allocated, data.planCurrency)}
                    </DescriptionItem>
                    <DescriptionItem label={allocationCopy.onAccount} numeric valueClassName="font-semibold">
                      {money(data.unallocated ?? 0, data.planCurrency)}
                    </DescriptionItem>
                  </DescriptionList>
                </>
              )}
            </div>
          ) : null}
        </AsyncSection>
      )}
      <DialogFooter>
        {canChange ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              onClose();
              onChange(paymentId);
            }}
          >
            {copy.change}
          </Button>
        ) : null}
        <Button type="button" onClick={onClose}>
          {copy.close}
        </Button>
      </DialogFooter>
    </>
  );
}
