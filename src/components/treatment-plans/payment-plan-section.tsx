'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import {
  createPaymentPlan,
  deletePaymentPlan,
  getPaymentPlan,
  type Installment,
  type InstallmentStatus,
  type PaymentPlan,
  type Periodicity,
} from '@/lib/payment-plans/payment-plan-api';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { FormField } from '@/components/molecules/form-field';
import { FormModal } from '@/components/molecules/form-modal';
import { ConfirmDialog } from '@/components/molecules/confirm-dialog';
import { EmptyState } from '@/components/molecules/empty-state';
import { SectionError } from '@/components/errors/section-error';
import { formatCivilDate } from '@/lib/format/date';

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
  // create modal
  createTitle: 'Crear plan de pagos',
  installmentsCount: 'N.º de cuotas',
  periodicity: 'Periodicidad',
  startDate: 'Fecha de inicio',
  downPayment: 'Pie (opcional)',
  totalField: 'Total a financiar',
  createSubmit: 'Crear',
  financedPreview: (financed: string, per: string) => `Financiado: ${financed} · Cuota: ${per}`,
  // table
  colSeq: '#',
  colDue: 'Vence',
  colAmount: 'Monto',
  colCovered: 'Cubierto',
  colStatus: 'Estado',
  downPaymentRow: 'Pie',
  tableCaption: 'Calendario de cuotas',
};

const INSTALLMENT_STATUS_BADGE_VARIANT: Record<InstallmentStatus, BadgeProps['variant']> = {
  PAID: 'success',
  PARTIAL: 'warning',
  PENDING: 'muted',
  OVERDUE: 'danger',
};

const INSTALLMENT_STATUS_LABELS: Record<InstallmentStatus, string> = {
  PAID: 'Pagada',
  PARTIAL: 'Parcial',
  PENDING: 'Pendiente',
  OVERDUE: 'Vencida',
};

const PERIODICITY_OPTIONS: { value: Periodicity; label: string }[] = [
  { value: 'MONTHLY', label: 'Mensual' },
  { value: 'BIWEEKLY', label: 'Quincenal' },
  { value: 'WEEKLY', label: 'Semanal' },
];

// Native <select>/<input> styled like the Input atom — same fieldClass string
// and rationale as treatment-plans-tab.tsx (kept native for a11y/tests).
const fieldClass =
  'flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50';

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('es', { style: 'currency', currency }).format(amount);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function todayLocalDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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
  const [installmentsCount, setInstallmentsCount] = useState('12');
  const [periodicity, setPeriodicity] = useState<Periodicity>('MONTHLY');
  const [startDate, setStartDate] = useState('');
  const [downPayment, setDownPayment] = useState('0');
  const [totalField, setTotalField] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

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

  function openCreate() {
    setInstallmentsCount('12');
    setPeriodicity('MONTHLY');
    setStartDate(todayLocalDateString());
    setDownPayment('0');
    setTotalField(String(billable));
    setCreateError(null);
    setShowCreate(true);
  }

  async function refetch() {
    const data = await getPaymentPlan(token, planId);
    setPlan(data);
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreateError(null);
    const count = Number(installmentsCount);
    const pie = Number(downPayment || '0');
    const total = Number(totalField);
    if (!Number.isInteger(count) || count < 1 || count > 600) {
      setCreateError('El número de cuotas debe ser un entero entre 1 y 600.');
      return;
    }
    if (!(total > 0)) {
      setCreateError('El total a financiar debe ser mayor que 0.');
      return;
    }
    if (pie < 0 || pie > total) {
      setCreateError('El pie no puede ser negativo ni mayor que el total.');
      return;
    }
    if (!startDate) {
      setCreateError('La fecha de inicio es obligatoria.');
      return;
    }
    setCreating(true);
    try {
      await createPaymentPlan(token, planId, {
        installmentsCount: count,
        periodicity,
        startDate: new Date(startDate).toISOString(),
        downPayment: pie,
        totalToFinance: total,
      });
      await refetch();
      setShowCreate(false);
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'No pudimos crear el plan de pagos.');
    } finally {
      setCreating(false);
    }
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

  // Live preview of the resulting installment (client-side only; the backend is
  // the source of truth — this is just UX).
  const previewFinanced = round2(Math.max(Number(totalField || '0') - Number(downPayment || '0'), 0));
  const previewPer = Number(installmentsCount) >= 1 ? round2(previewFinanced / Number(installmentsCount)) : 0;

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
          <Button type="button" onClick={openCreate}>{copy.createCta}</Button>
        </div>
      ) : (
        <>
          <PaymentPlanSummary plan={plan} currency={planCurrency} />
          <InstallmentsTable plan={plan} currency={planCurrency} />
        </>
      )}

      <FormModal
        open={showCreate}
        onOpenChange={setShowCreate}
        title={copy.createTitle}
        onSubmit={handleCreate}
        submitLabel={copy.createSubmit}
        submitting={creating}
        error={createError}
        size="lg"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField htmlFor="pp-count" label={copy.installmentsCount}>
            <Input id="pp-count" type="number" min={1} max={600} step="1" value={installmentsCount} onChange={(e) => setInstallmentsCount(e.target.value)} />
          </FormField>
          <FormField htmlFor="pp-periodicity" label={copy.periodicity}>
            <select id="pp-periodicity" value={periodicity} onChange={(e) => setPeriodicity(e.target.value as Periodicity)} className={fieldClass}>
              {PERIODICITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField htmlFor="pp-start" label={copy.startDate}>
            <Input id="pp-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </FormField>
          <FormField htmlFor="pp-down" label={copy.downPayment}>
            <Input id="pp-down" type="number" min={0} step="0.01" value={downPayment} onChange={(e) => setDownPayment(e.target.value)} />
          </FormField>
        </div>
        <FormField htmlFor="pp-total" label={copy.totalField}>
          <Input id="pp-total" type="number" min={0} step="0.01" value={totalField} onChange={(e) => setTotalField(e.target.value)} />
        </FormField>
        <p className="text-sm text-muted">
          {copy.financedPreview(formatMoney(previewFinanced, planCurrency), formatMoney(previewPer, planCurrency))}
        </p>
      </FormModal>

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
        <SummaryTile label={copy.totalToFinance} value={formatMoney(plan.totalToFinance, currency)} />
        <SummaryTile label={copy.paid} value={formatMoney(plan.paidTotal, currency)} />
        <SummaryTile label={copy.remaining} value={formatMoney(plan.remaining, currency)} />
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <span className="text-muted">
          {copy.nextDue}:{' '}
          <span className="font-medium text-ink">
            {plan.nextDue ? `${formatCivilDate(plan.nextDue.dueDate)} · ${formatMoney(plan.nextDue.amount, currency)}` : copy.none}
          </span>
        </span>
        {plan.overdueCount > 0 ? (
          <span className="font-medium text-danger">
            {copy.overdue}: {plan.overdueCount} · {formatMoney(plan.overdueAmount, currency)}
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
                <TableCell className="text-right tabular-nums">{formatMoney(r.amount, currency)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(r.covered, currency)}</TableCell>
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
                {formatMoney(r.covered, currency)}
                {' / '}
                <span className="sr-only">Monto: </span>
                {formatMoney(r.amount, currency)}
              </p>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
