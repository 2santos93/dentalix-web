'use client';
import { useEffect, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  deletePaymentPlan,
  getPaymentPlan,
  type Installment,
  type InstallmentStatus,
  type PaymentPlan,
} from '@/lib/payment-plans/payment-plan-api';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { DescriptionItem, DescriptionList } from '@/components/ui/description-list';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CreatePaymentPlanModal } from '@/components/payment-plans/create-payment-plan-modal';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { SectionError } from '@/components/errors/section-error';
import { formatCivilDate } from '@/lib/format/date';
// DX-489: con el formato de la sede, como el resto de importes del plan
// (`moneyWithCode` nunca lanza con un código que Intl no acepta).
import type { RegionalFormat } from '@/lib/format/regional-format';
import { sedeMoney } from '@/lib/format/sede-number';

const copy = {
  heading: 'Plan de pagos',
  createCta: 'Crear plan de pagos',
  emptyTitle: 'Sin plan de pagos',
  emptyDescription: 'Financia este tratamiento en cuotas: define el pie, el número de cuotas y la periodicidad.',
  notBillableDescription: 'Un plan rechazado o cancelado no se financia en cuotas.',
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
  /** DX-489: el formato de la sede (el de la lista de abonos); sin él, «—». */
  fmt: RegionalFormat | null;
  /**
   * ¿Se puede crear un plan de cuotas? No en un plan rechazado o cancelado
   * (DX-109: la API responde 409). Por defecto, sí.
   */
  canCreate?: boolean;
}

export function PaymentPlanSection({
  token,
  planId,
  planCurrency,
  billable,
  refreshSignal,
  fmt,
  canCreate = true,
}: PaymentPlanSectionProps) {
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
        if (!cancelled) setLoadError(apiErrorMessage(err, copy.loadError));
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
      setCancelError(apiErrorMessage(err, 'No pudimos cancelar el plan de pagos.'));
    } finally {
      setCancelling(false);
    }
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="payment-plan-heading">
      <div className="flex items-center justify-between gap-2">
        <h3 id="payment-plan-heading" className="t-title text-ink">
          {copy.heading}
        </h3>
        {plan ? (
          // Abre su confirmación: destructiva en forma «ghost» (DESIGN.md).
          <Button type="button" variant="destructive-ghost" size="sm" onClick={() => setShowCancel(true)}>
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
        // Vacío de sección: una línea, sin caja (la caja grande es para una
        // pestaña entera vacía). La primaria de la pestaña es «Agregar ítem».
        <EmptyState
          size="inline"
          role="status"
          title={copy.emptyTitle}
          description={canCreate ? copy.emptyDescription : copy.notBillableDescription}
          action={
            canCreate ? (
              <Button type="button" variant="secondary" size="sm" onClick={() => setShowCreate(true)}>
                {copy.createCta}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <PaymentPlanSummary plan={plan} currency={planCurrency} fmt={fmt} />
          <InstallmentsTable plan={plan} currency={planCurrency} fmt={fmt} />
        </>
      )}

      <CreatePaymentPlanModal
        open={showCreate}
        onOpenChange={setShowCreate}
        token={token}
        plan={{ id: planId, currency: planCurrency, billable }}
        money={(amount, code) => sedeMoney(amount, code, fmt)}
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

/**
 * Las cifras del financiamiento como pares etiqueta/valor (`DescriptionList`),
 * no como tres tarjetas de número grande: DESIGN.md prohíbe la plantilla de
 * métrica-héroe como estructura.
 */
function PaymentPlanSummary({ plan, currency, fmt }: { plan: PaymentPlan; currency: string; fmt: RegionalFormat | null }) {
  const money = (amount: number) => sedeMoney(amount, currency, fmt);
  return (
    <DescriptionList columns={3}>
      <DescriptionItem label={copy.totalToFinance} numeric>
        {money(plan.totalToFinance)}
      </DescriptionItem>
      <DescriptionItem label={copy.paid} numeric>
        {money(plan.paidTotal)}
      </DescriptionItem>
      <DescriptionItem label={copy.remaining} numeric valueClassName="font-semibold">
        {money(plan.remaining)}
      </DescriptionItem>
      <DescriptionItem label={copy.nextDue} numeric>
        {plan.nextDue ? `${formatCivilDate(plan.nextDue.dueDate)} · ${money(plan.nextDue.amount)}` : copy.none}
      </DescriptionItem>
      {plan.overdueCount > 0 ? (
        <DescriptionItem label={copy.overdue} numeric valueClassName="font-medium text-danger-text">
          {plan.overdueCount} · {money(plan.overdueAmount)}
        </DescriptionItem>
      ) : null}
    </DescriptionList>
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

/**
 * El calendario como `DataList` (tabla desde \`sm\`, tarjeta compacta en el
 * teléfono: cuota + cubierto/monto / vencimiento · estado). Ningún importe se
 * esconde en el teléfono.
 */
function InstallmentsTable({ plan, currency, fmt }: { plan: PaymentPlan; currency: string; fmt: RegionalFormat | null }) {
  const money = (amount: number) => sedeMoney(amount, currency, fmt);
  const columns: DataListColumn<Row>[] = [
    {
      id: 'seq',
      header: copy.colSeq,
      mobile: 'primary',
      cell: (r) => <span className="font-medium tabular-nums">{r.label}</span>,
      mobileCell: (r) => (r.key === 'down' ? r.label : `#${r.label}`),
    },
    { id: 'due', header: copy.colDue, cell: (r) => <span className="tabular-nums">{formatCivilDate(r.dueDate)}</span> },
    { id: 'amount', header: copy.colAmount, numeric: true, cell: (r) => money(r.amount), mobile: 'hidden' },
    {
      id: 'covered',
      header: copy.colCovered,
      numeric: true,
      mobile: 'trailing',
      cell: (r) => money(r.covered),
      mobileCell: (r) => (
        <>
          <span className="sr-only">{copy.colCovered}: </span>
          {money(r.covered)}
          {' / '}
          <span className="sr-only">{copy.colAmount}: </span>
          {money(r.amount)}
        </>
      ),
    },
    { id: 'status', header: copy.colStatus, cell: (r) => <StatusBadge kind="installment" status={r.status} /> },
  ];
  return <DataList label={copy.tableCaption} rows={buildRows(plan)} columns={columns} getRowKey={(r) => r.key} />;
}
