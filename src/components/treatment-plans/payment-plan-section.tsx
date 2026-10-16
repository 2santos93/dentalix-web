'use client';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import {
  deletePaymentPlan,
  getPaymentPlan,
  type Installment,
  type InstallmentStatus,
  type PaymentPlan,
} from '@/lib/payment-plans/payment-plan-api';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CreatePaymentPlanModal } from '@/components/payment-plans/create-payment-plan-modal';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { SectionError } from '@/components/errors/section-error';
import { formatCivilDate } from '@/lib/format/date';
// Crash-safe by contract: a plan whose currency isn't a valid ISO 4217 code
// would make an inline `Intl.NumberFormat` throw during render and take this
// whole subtree down (~8 money cells here). See `formatCurrency`'s own doc.
import { formatCurrency } from '@/lib/format/currency';
import {
  INSTALLMENT_STATUS_BADGE_VARIANT,
  INSTALLMENT_STATUS_LABELS,
} from '@/lib/payment-plans/installment-status';

const copy = {
  heading: 'Plan de pagos',
  createCta: 'Crear plan de pagos',
  emptyTitle: 'Sin plan de pagos',
  emptyDescription: 'Financia este tratamiento en cuotas: define el pie, el número de cuotas y la periodicidad.',
  // No «Intenta de nuevo.» — `SectionError` has its own retry button.
  loadError: 'No pudimos cargar el plan de pagos.',
  cancelPlan: 'Cancelar plan',
  cancelConfirmTitle: '¿Cancelar el plan de pagos?',
  cancelConfirmDescription: 'Se cancelará el calendario de cuotas. Los abonos registrados no se ven afectados. Podrás crear uno nuevo.',
  cancelConfirm: 'Sí, cancelar',
  totalToFinance: 'Total a financiar',
  paid: 'Pagado',
  remaining: 'Saldo',
  nextDue: 'Próxima cuota',
  overdue: 'En mora',
  none: '—',
  // table
  colSeq: '#',
  colDue: 'Vence',
  colAmount: 'Monto',
  colCovered: 'Cubierto',
  colStatus: 'Estado',
  downPaymentRow: 'Pie',
  tableCaption: 'Calendario de cuotas',
};

interface PaymentPlanSectionProps {
  token: string;
  planId: string;
  planCurrency: string;
  billable: number;
  refreshSignal: number;
}

export function PaymentPlanSection({ token, planId, planCurrency, billable, refreshSignal }: PaymentPlanSectionProps) {
  const [plan, setPlan] = useState<PaymentPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  const [showCreate, setShowCreate] = useState(false);

  const [showCancel, setShowCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Fetch on plan change AND whenever the parent bumps refreshSignal (after an
  // abono is recorded/voided) so installment coverage stays in sync.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await getPaymentPlan(token, planId);
        if (!cancelled) {
          setPlan(data);
          setLoadError(null);
        }
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : copy.loadError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, planId, refreshSignal, retryTick]);

  async function refetch() {
    const data = await getPaymentPlan(token, planId);
    setPlan(data);
  }

  async function handleCancel() {
    setCancelError(null);
    setCancelling(true);
    try {
      await deletePaymentPlan(token, planId);
      setShowCancel(false);
      await refetch();
    } catch (err) {
      setCancelError(err instanceof ApiError ? err.message : 'No pudimos cancelar el plan de pagos.');
    } finally {
      setCancelling(false);
    }
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="payment-plan-heading">
      <div className="flex items-center justify-between gap-2">
        <h3 id="payment-plan-heading" className="text-base font-semibold text-ink">
          {copy.heading}
        </h3>
        {plan ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setShowCancel(true)}>
            {copy.cancelPlan}
          </Button>
        ) : null}
      </div>

      {loading ? (
        <Skeleton className="h-24 w-full" />
      ) : loadError ? (
        <SectionError
          description={loadError}
          onRetry={() => {
            setLoadError(null);
            setRetryTick((t) => t + 1);
          }}
        />
      ) : !plan ? (
        <div className="flex flex-col items-start gap-3">
          <EmptyState role="status" title={copy.emptyTitle} description={copy.emptyDescription} />
          <Button type="button" onClick={() => setShowCreate(true)}>{copy.createCta}</Button>
        </div>
      ) : (
        <>
          <PaymentPlanSummary plan={plan} currency={planCurrency} />
          <InstallmentsTable plan={plan} currency={planCurrency} />
        </>
      )}

      <CreatePaymentPlanModal
        open={showCreate}
        onOpenChange={setShowCreate}
        token={token}
        plan={{ id: planId, currency: planCurrency, billable }}
        onCreated={async () => {
          await refetch();
          setShowCreate(false);
        }}
      />

      <ConfirmDialog
        open={showCancel}
        onOpenChange={setShowCancel}
        title={copy.cancelConfirmTitle}
        description={copy.cancelConfirmDescription}
        confirmLabel={copy.cancelConfirm}
        onConfirm={handleCancel}
        confirming={cancelling}
        error={cancelError}
      />
    </section>
  );
}

function PaymentPlanSummary({ plan, currency }: { plan: PaymentPlan; currency: string }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryTile label={copy.totalToFinance} value={formatCurrency(plan.totalToFinance, currency)} />
        <SummaryTile label={copy.paid} value={formatCurrency(plan.paidTotal, currency)} />
        <SummaryTile label={copy.remaining} value={formatCurrency(plan.remaining, currency)} />
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <span className="text-muted">
          {copy.nextDue}:{' '}
          <span className="font-medium text-ink">
            {plan.nextDue ? `${formatCivilDate(plan.nextDue.dueDate)} · ${formatCurrency(plan.nextDue.amount, currency)}` : copy.none}
          </span>
        </span>
        {plan.overdueCount > 0 ? (
          <span className="font-medium text-danger">
            {copy.overdue}: {plan.overdueCount} · {formatCurrency(plan.overdueAmount, currency)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-ink tabular-nums">{value}</p>
    </div>
  );
}

// Rows = optional down-payment tramo first, then installments. The down-payment
// tramo (plan.downPaymentStatus) is only present when downPayment > 0.
interface Row {
  key: string;
  label: string;
  dueDate: string;
  amount: number;
  covered: number;
  status: InstallmentStatus;
}

function buildRows(plan: PaymentPlan): Row[] {
  const rows: Row[] = [];
  if (plan.downPaymentStatus) {
    rows.push({
      key: 'down',
      label: copy.downPaymentRow,
      dueDate: plan.downPaymentStatus.dueDate,
      amount: plan.downPaymentStatus.amount,
      covered: plan.downPaymentStatus.covered,
      status: plan.downPaymentStatus.status as InstallmentStatus,
    });
  }
  for (const inst of plan.installments as Installment[]) {
    rows.push({
      key: `i${inst.sequence}`,
      label: String(inst.sequence),
      dueDate: inst.dueDate,
      amount: inst.amount,
      covered: inst.covered,
      status: inst.status as InstallmentStatus,
    });
  }
  return rows;
}

function InstallmentsTable({ plan, currency }: { plan: PaymentPlan; currency: string }) {
  const rows = buildRows(plan);
  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block">
        <Table>
          <caption className="sr-only">{copy.tableCaption}</caption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{copy.colSeq}</TableHead>
              <TableHead>{copy.colDue}</TableHead>
              <TableHead className="text-right">{copy.colAmount}</TableHead>
              <TableHead className="text-right">{copy.colCovered}</TableHead>
              <TableHead>{copy.colStatus}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.key}>
                <TableCell className="font-medium tabular-nums">{r.label}</TableCell>
                <TableCell className="tabular-nums">{formatCivilDate(r.dueDate)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(r.amount, currency)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(r.covered, currency)}</TableCell>
                <TableCell>
                  <Badge variant={INSTALLMENT_STATUS_BADGE_VARIANT[r.status]}>
                    {INSTALLMENT_STATUS_LABELS[r.status]}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((r) => (
          <li key={r.key}>
            <Card className="p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-ink tabular-nums">{copy.colSeq === '#' ? `#${r.label}` : r.label}</span>
                <Badge variant={INSTALLMENT_STATUS_BADGE_VARIANT[r.status]}>
                  {INSTALLMENT_STATUS_LABELS[r.status]}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted tabular-nums">{formatCivilDate(r.dueDate)}</p>
              <p className="mt-1 font-medium text-ink tabular-nums">
                <span className="sr-only">Cubierto: </span>
                {formatCurrency(r.covered, currency)}
                {' / '}
                <span className="sr-only">Monto: </span>
                {formatCurrency(r.amount, currency)}
              </p>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
