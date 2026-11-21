'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Ban, CheckCheck, CircleDollarSign, FilePenLine, PackageCheck, Pencil, Plus, Printer, Send, Factory } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { getTokenRole } from '@/lib/auth/token-role';
import {
  canCheckLabOrders,
  canPrintLabOrders,
  canSendLabOrders,
  canSetLabOrderCost,
  canWriteLabOrders,
  labOrderCostAmount,
  labOrderCostOtherCurrency,
  labOrderNumberLabel,
  labOrderPrintHref,
  labOrderSteps,
  LAB_ORDERS_HREF,
  listPatientLabOrders,
  teethLabel,
  type LabOrder,
} from '@/lib/lab-orders/lab-orders-api';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { AsyncSection } from '@/components/shared/async-section';
import type { RowAction } from '@/components/shared/row-actions';
import { Button } from '@/components/ui/button';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { SectionHeader } from '@/components/ui/section-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { LabOrderDueLine, LabOrderStatusChips } from './lab-order-status';
import type { LabOrderFormMode } from './lab-order-form-dialog';
import type { LabOrderStepKind } from './lab-order-step-dialog';

// Los diálogos llegan en su propio trozo, al abrirlos (presupuesto de la ficha).
const LabOrderFormDialog = dynamic(() => import('./lab-order-form-dialog').then((m) => m.LabOrderFormDialog), {
  ssr: false,
});
const LabOrderStepDialog = dynamic(() => import('./lab-order-step-dialog').then((m) => m.LabOrderStepDialog), {
  ssr: false,
});
const LabOrderCostDialog = dynamic(() => import('./lab-order-cost-dialog').then((m) => m.LabOrderCostDialog), {
  ssr: false,
});
const CancelLabOrderDialog = dynamic(() => import('./cancel-lab-order-dialog').then((m) => m.CancelLabOrderDialog), {
  ssr: false,
});

export const patientLabOrdersCopy = {
  heading: 'Laboratorio',
  support:
    'Coronas, prótesis, férulas y alineadores que se mandan al laboratorio dental: qué se envió, cuándo lo prometieron y si ya llegó. Una orden enviada no se edita: se corrige con una orden nueva que la sustituye.',
  newOrder: 'Nueva orden',
  listLink: 'Trabajos de laboratorio',
  empty: 'Aún no hay trabajos de laboratorio',
  emptyHintWriter: 'Crea la orden desde un ítem del plan o sin él, con el laboratorio, el servicio y la fecha prometida.',
  emptyHint: 'Las órdenes las crean odontología y administración; aquí se ven, se envían y se reciben.',
  loadError: 'No pudimos cargar los trabajos de laboratorio.',
  loading: 'Cargando los trabajos de laboratorio',
  tableLabel: 'Órdenes de laboratorio del paciente',
  colOrder: 'Orden',
  colLab: 'Laboratorio',
  colTeeth: 'Dientes',
  colDue: 'Fecha prometida',
  colStatus: 'Estado',
  noDue: 'Sin fecha',
  dueOn: (date: string) => `Prometida ${date}`,
  replaces: (n: string) => `Corrige la orden ${n}`,
  replacedBy: (n: string) => `Sustituida por la orden ${n}`,
  fromPlanItem: (tooth: string, procedure: string) => (tooth ? `Del plan: ${procedure} · diente ${tooth}` : `Del plan: ${procedure}`),
  cancelled: (reason: string) => `Motivo: ${reason}`,
  rowLabel: (n: string, description: string) => `Orden ${n} · ${description}`,
  edit: 'Editar',
  send: 'Enviar',
  receive: 'Recibir',
  check: 'Revisar',
  correct: 'Corregir',
  cancel: 'Anular',
  print: 'Imprimir',
  // DX-018-bis: lo que cobra el laboratorio (solo administración).
  cost: 'Costo del laboratorio',
  costValue: (amount: string) => `Costo ${amount}`,
  costOtherCurrency: 'En otra moneda que el plan: no se descuenta de los honorarios',
};

const copy = patientLabOrdersCopy;
const PAGE_SIZE = 50;

interface PatientLabOrdersTabProps {
  token: string;
  patientId: string;
  /** Ítem del plan del acceso directo «Orden de laboratorio»: abre «Nueva orden» desde él. */
  planItemId?: string | null;
  /** Avisa de que el acceso directo ya se usó (la página limpia la URL). */
  onShortcutConsumed?: () => void;
}

function TabSkeleton() {
  return (
    <div role="status" aria-label={copy.loading} className="flex flex-col gap-3">
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
    </div>
  );
}

type Dialog =
  | { kind: 'form'; mode: LabOrderFormMode; key: number }
  | { kind: 'step'; step: LabOrderStepKind; order: LabOrder }
  | { kind: 'cancel'; order: LabOrder }
  | { kind: 'cost'; order: LabOrder }
  | null;

/**
 * Sección «Laboratorio» de la ficha (DX-017), los cuatro roles: las órdenes del
 * paciente con su estado (sale de las fechas), atrasada en rojo con los días,
 * laboratorio, servicio, dientes y fecha prometida. «Nueva orden», «Editar» un
 * borrador, «Corregir» una enviada y «Anular», solo DENTIST y ADMIN; «Enviar» y
 * «Recibir», también recepción; «Revisar», DENTIST y ADMIN; «Imprimir», los
 * roles clínicos. La API vuelve a comprobar cada paso.
 */
export function PatientLabOrdersTab({ token, patientId, planItemId = null, onShortcutConsumed }: PatientLabOrdersTabProps) {
  const role = getTokenRole(token);
  const canWrite = canWriteLabOrders(role);
  const actor = { canWrite, canSend: canSendLabOrders(role), canCheck: canCheckLabOrders(role) };
  const canPrint = canPrintLabOrders(role);
  const canCost = canSetLabOrderCost(role);
  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [shortcutUsed, setShortcutUsed] = useState(false);
  const stamp = useSedeStamp(
    token,
    orders.map((o) => o.locationId),
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const page = await listPatientLabOrders(token, patientId, { pageSize: PAGE_SIZE });
        if (cancelled) return;
        setOrders(page.items);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(apiErrorMessage(err, copy.loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, patientId, reloadKey]);

  // Acceso directo del plan: «Nueva orden» desde el ítem (estado derivado; se
  // apaga al cerrar el formulario).
  const shortcutOpen = !shortcutUsed && Boolean(planItemId) && canWrite;
  const formDialog: { mode: LabOrderFormMode; key: number } | null = shortcutOpen
    ? { mode: { kind: 'create', planItemId }, key: -1 }
    : dialog?.kind === 'form'
      ? dialog
      : null;

  function closeDialog() {
    if (shortcutOpen) {
      setShortcutUsed(true);
      onShortcutConsumed?.();
    }
    setDialog(null);
  }

  function openForm(mode: LabOrderFormMode) {
    setDialog((prev) => ({ kind: 'form', mode, key: (prev?.kind === 'form' ? prev.key : 0) + 1 }));
  }

  /** Una orden nueva o cambiada: arriba la nueva, en su sitio la cambiada. */
  function upsert(saved: LabOrder) {
    setOrders((prev) =>
      prev.some((o) => o.id === saved.id) ? prev.map((o) => (o.id === saved.id ? saved : o)) : [saved, ...prev],
    );
    // La corregida gana su «Sustituida por…»: se relee la lista entera.
    if (saved.replacesOrder) setReloadKey((k) => k + 1);
  }

  function rowActions(order: LabOrder): RowAction[] {
    const actions: RowAction[] = [];
    if (order.status === 'DRAFT' && canWrite) {
      actions.push({ label: copy.edit, icon: <Pencil aria-hidden />, onSelect: () => openForm({ kind: 'edit', order }) });
    }
    for (const step of labOrderSteps(order, actor)) {
      if (step === 'send') {
        actions.push({ label: copy.send, icon: <Send aria-hidden />, onSelect: () => setDialog({ kind: 'step', step, order }) });
      } else if (step === 'receive') {
        actions.push({
          label: copy.receive,
          icon: <PackageCheck aria-hidden />,
          onSelect: () => setDialog({ kind: 'step', step, order }),
        });
      } else if (step === 'check') {
        actions.push({
          label: copy.check,
          icon: <CheckCheck aria-hidden />,
          onSelect: () => setDialog({ kind: 'step', step, order }),
        });
      } else if (step === 'correct') {
        actions.push({
          label: copy.correct,
          icon: <FilePenLine aria-hidden />,
          onSelect: () => openForm({ kind: 'correct', order }),
        });
      }
    }
    if (canCost && order.status !== 'CANCELLED') {
      actions.push({
        label: copy.cost,
        icon: <CircleDollarSign aria-hidden />,
        onSelect: () => setDialog({ kind: 'cost', order }),
      });
    }
    if (canPrint) {
      actions.push({
        label: copy.print,
        icon: <Printer aria-hidden />,
        onSelect: () => {
          window.open(labOrderPrintHref(order.id), '_blank', 'noopener');
        },
      });
    }
    if (labOrderSteps(order, actor).includes('cancel')) {
      actions.push({
        label: copy.cancel,
        icon: <Ban aria-hidden />,
        destructive: true,
        separatorBefore: actions.length > 0,
        onSelect: () => setDialog({ kind: 'cancel', order }),
      });
    }
    return actions;
  }

  function orderCell(order: LabOrder) {
    const voided = order.status === 'CANCELLED';
    return (
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className={cn('font-medium [overflow-wrap:anywhere]', voided && 'text-muted line-through')}>
          {order.description}
        </span>
        <span className="t-id t-caption text-muted">{labOrderNumberLabel(order.number)}</span>
        {order.treatmentPlanItem ? (
          <span className="t-caption text-muted [overflow-wrap:anywhere]">
            {copy.fromPlanItem(order.treatmentPlanItem.toothNumber, order.treatmentPlanItem.procedureName)}
          </span>
        ) : null}
        {order.replacesOrder ? (
          <span className="t-caption text-muted">{copy.replaces(labOrderNumberLabel(order.replacesOrder.number))}</span>
        ) : null}
        {order.replacedBy.map((r) => (
          <span key={r.id} className="t-caption text-muted">
            {copy.replacedBy(labOrderNumberLabel(r.number))}
          </span>
        ))}
      </span>
    );
  }

  function labCell(order: LabOrder) {
    return (
      <span className="flex min-w-0 flex-col gap-0.5 [overflow-wrap:anywhere]">
        <span>{order.lab.name}</span>
        {order.service ? <span className="t-caption text-muted">{order.service.name}</span> : null}
        {costLine(order)}
      </span>
    );
  }

  /** DX-018-bis: el costo (la API solo lo manda a ADMIN). */
  function costLine(order: LabOrder) {
    const amount = labOrderCostAmount(order);
    if (amount === null || order.cost === null) return null;
    return (
      <>
        <span className="t-caption text-muted tabular-nums">
          {copy.costValue(stamp.money(amount, order.cost.currency, order.locationId))}
        </span>
        {labOrderCostOtherCurrency(order) ? (
          <span className="t-caption text-warning-text">{copy.costOtherCurrency}</span>
        ) : null}
      </>
    );
  }

  function statusCell(order: LabOrder) {
    return (
      <span className="flex min-w-0 flex-col items-start gap-1">
        <LabOrderStatusChips order={order} />
        {order.status === 'CANCELLED' && order.cancelReason ? (
          <span className="t-caption text-muted [overflow-wrap:anywhere]">{copy.cancelled(order.cancelReason)}</span>
        ) : null}
      </span>
    );
  }

  const columns: DataListColumn<LabOrder>[] = [
    { id: 'order', header: copy.colOrder, mobile: 'primary', cell: orderCell, cellClassName: 'align-top' },
    {
      id: 'lab',
      header: copy.colLab,
      cell: labCell,
      mobileCell: (o) => (o.service ? `${o.lab.name} · ${o.service.name}` : o.lab.name),
      cellClassName: 'align-top',
    },
    {
      id: 'teeth',
      header: copy.colTeeth,
      cell: (o) => <span className="t-data">{o.toothNumbers.join(', ') || '—'}</span>,
      mobileCell: (o) => teethLabel(o.toothNumbers),
      cellClassName: 'align-top',
    },
    {
      id: 'due',
      header: copy.colDue,
      cell: (o) => (
        <span className={cn('t-data', o.overdue && 'font-medium text-danger-text')}>
          {o.dueOn ? stamp.civilDate(o.dueOn, o.locationId) : copy.noDue}
        </span>
      ),
      mobileCell: (o) => {
        // Sin fecha (o sin formato de la sede) y sin atraso, la línea se omite.
        const day = o.dueOn ? stamp.maybe.civilDate(o.dueOn, o.locationId) : null;
        return day || o.overdue ? <LabOrderDueLine order={o} day={day} label={copy.dueOn} /> : null;
      },
      cellClassName: 'align-top',
    },
    {
      id: 'status',
      header: copy.colStatus,
      mobile: 'trailing',
      cell: statusCell,
      // En la tarjeta, solo el estado: el atraso va en la línea de la fecha.
      mobileCell: (o) => <StatusBadge kind="labOrder" status={o.status} />,
      cellClassName: 'align-top',
    },
  ];

  const actions = (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
      <Button asChild variant="secondary" className="w-full sm:w-auto">
        <Link href={LAB_ORDERS_HREF}>
          <Factory aria-hidden />
          {copy.listLink}
        </Link>
      </Button>
      {canWrite && orders.length > 0 ? (
        <Button type="button" onClick={() => openForm({ kind: 'create', planItemId: null })} className="w-full sm:w-auto">
          <Plus aria-hidden />
          {copy.newOrder}
        </Button>
      ) : null}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title={copy.heading}
        description={<span className="block max-w-[68ch]">{copy.support}</span>}
        actions={actions}
      />
      <SedeStampNote stamp={stamp} />
      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        isEmpty={orders.length === 0}
        emptyTitle={copy.empty}
        emptyDescription={canWrite ? copy.emptyHintWriter : copy.emptyHint}
        emptyIcon={<Factory aria-hidden />}
        emptyAction={
          canWrite ? (
            <Button type="button" onClick={() => openForm({ kind: 'create', planItemId: null })}>
              <Plus aria-hidden />
              {copy.newOrder}
            </Button>
          ) : null
        }
        skeleton={<TabSkeleton />}
      >
        <DataList
          label={copy.tableLabel}
          rows={orders}
          columns={columns}
          getRowKey={(o) => o.id}
          getRowLabel={(o) => copy.rowLabel(labOrderNumberLabel(o.number), o.description)}
          rowActions={rowActions}
        />
      </AsyncSection>

      {formDialog ? (
        <LabOrderFormDialog
          key={formDialog.key}
          open
          onOpenChange={(o) => !o && closeDialog()}
          token={token}
          patientId={patientId}
          mode={formDialog.mode}
          onSaved={upsert}
        />
      ) : null}
      {dialog?.kind === 'step' ? (
        <LabOrderStepDialog
          key={`${dialog.step}-${dialog.order.id}`}
          open
          onOpenChange={(o) => !o && closeDialog()}
          token={token}
          step={dialog.step}
          order={dialog.order}
          onDone={upsert}
        />
      ) : null}
      {dialog?.kind === 'cost' ? (
        <LabOrderCostDialog
          key={`cost-${dialog.order.id}`}
          open
          onOpenChange={(o) => !o && closeDialog()}
          token={token}
          order={dialog.order}
          onSaved={upsert}
        />
      ) : null}
      {dialog?.kind === 'cancel' ? (
        <CancelLabOrderDialog
          key={dialog.order.id}
          open
          onOpenChange={(o) => !o && closeDialog()}
          token={token}
          order={dialog.order}
          onCancelled={upsert}
        />
      ) : null}
    </div>
  );
}
