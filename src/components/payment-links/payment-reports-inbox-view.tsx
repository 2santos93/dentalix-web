'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, FileSearch, Inbox, XCircle } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { onLocationChange } from '@/lib/locations/location-store';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import {
  listPaymentReports,
  type ConfirmedPaymentReport,
  type PaymentReport,
  type PaymentReportStatus,
  type RejectedPaymentReport,
} from '@/lib/payment-links/payment-links-api';
import { statusLabel } from '@/lib/status/tones';
import { notifyError, notifySuccess } from '@/components/errors/notify';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { PageHeader } from '@/components/shared/page-header';
import { Pagination } from '@/components/shared/pagination';
import type { RowAction } from '@/components/shared/row-actions';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { Button } from '@/components/ui/button';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { StatusBadge } from '@/components/ui/status-badge';
import { useReportProofViewer } from '@/components/payments/payment-proof-viewer';
import { PaymentReceiptDialog } from '@/components/payments/payment-receipt-dialog';
import type { CashViewTabs } from '@/components/payments/cash-register-view';
import { ConfirmPaymentReportModal } from './confirm-payment-report-modal';
import { RejectPaymentReportModal } from './reject-payment-report-modal';

type Filter = PaymentReportStatus | 'ALL';

export const paymentReportsInboxCopy = {
  title: 'Caja',
  description:
    'Pagos que los pacientes reportaron desde su enlace de pago. Al confirmarlo se registra el abono en tu caja; al rechazarlo, el saldo no cambia.',
  filterLabel: 'Estado de los pagos reportados',
  filters: { PENDING: 'Por confirmar', CONFIRMED: 'Confirmados', REJECTED: 'Rechazados', ALL: 'Todos' } satisfies Record<
    Filter,
    string
  >,
  loadError: 'No pudimos cargar los pagos reportados.',
  emptyPending: 'No hay pagos por confirmar',
  emptyPendingHint: 'Cuando un paciente reporte su pago desde el enlace, aparecerá aquí.',
  empty: 'No hay pagos reportados con este estado',
  emptyHint: 'Prueba con otro estado o con otra sede.',
  tableLabel: 'Pagos reportados, los más antiguos primero',
  count: (n: number) => (n === 1 ? '1 pago reportado' : `${n} pagos reportados`),
  colPatient: 'Paciente',
  colMethod: 'Medio',
  colAmount: 'Importe',
  colReference: 'Referencia',
  colPaidOn: 'Fecha del pago',
  colProof: 'Comprobante',
  colStatus: 'Estado',
  noReference: 'Sin referencia',
  viewProof: 'Ver',
  viewProofLabel: (patient: string) => `Ver el comprobante de ${patient}`,
  noProof: 'No',
  confirm: 'Confirmar',
  reject: 'Rechazar',
  viewProofAction: 'Ver comprobante',
  confirmed: 'Pago confirmado: el abono quedó registrado.',
  rejectedNotified: 'Pago rechazado. Se avisó al paciente por email.',
  rejectedNotNotified: 'Pago rechazado. El paciente no tiene email: avísale tú.',
  stale: 'Otra persona ya decidió este pago. La lista se actualizó.',
  rowLabel: (patient: string, amount: string) => `pago de ${patient} por ${amount}`,
};
const copy = paymentReportsInboxCopy;

const PAGE_SIZE = 20;

interface PaymentReportsInboxViewProps {
  token: string;
  tabs?: CashViewTabs;
  /** Tras confirmar o rechazar: el contador de la pestaña se vuelve a leer. */
  onChanged?: () => void;
}

/**
 * Bandeja «Pagos por confirmar» de la Caja (DX-569): lo que los pacientes
 * reportaron desde su enlace de pago, en la sede activa (la cabecera de la
 * sede, como el resto de Caja), con filtro por estado. Confirmar abre el
 * cobro precargado y, hecho, ofrece el recibo; rechazar pide el motivo. Si
 * otra persona lo decidió antes (409), la lista se recarga y se avisa.
 */
export function PaymentReportsInboxView({ token, tabs, onChanged }: PaymentReportsInboxViewProps) {
  const [filter, setFilter] = useState<Filter>('PENDING');
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    items: PaymentReport[];
    total: number;
    pageSize: number;
    error: string | null;
  } | null>(null);
  const [confirming, setConfirming] = useState<PaymentReport | null>(null);
  const [rejecting, setRejecting] = useState<PaymentReport | null>(null);
  const [receiptPaymentId, setReceiptPaymentId] = useState<string | null>(null);
  const proofViewer = useReportProofViewer(token);
  const key = `${filter}|${page}|${reloadKey}`;
  const loading = result?.key !== key;
  const rows = result && !result.error ? result.items : [];
  const stamp = useSedeStamp(
    token,
    rows.map((r) => r.locationId),
  );

  useEffect(() => onLocationChange(() => setReloadKey((k) => k + 1)), []);

  useEffect(() => {
    let cancelled = false;
    listPaymentReports(token, { status: filter === 'ALL' ? undefined : filter, page, pageSize: PAGE_SIZE })
      .then((data) => {
        if (!cancelled) setResult({ key, items: data.items, total: data.total, pageSize: data.pageSize, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) setResult({ key, items: [], total: 0, pageSize: PAGE_SIZE, error: apiErrorMessage(err, copy.loadError) });
      });
    return () => {
      cancelled = true;
    };
  }, [token, filter, page, key]);

  function reload() {
    setReloadKey((k) => k + 1);
    onChanged?.();
  }

  function stale() {
    setConfirming(null);
    setRejecting(null);
    notifyError(copy.stale);
    reload();
  }

  const money = (r: PaymentReport) => stamp.money(r.amount, r.currency, r.locationId);

  const columns: DataListColumn<PaymentReport>[] = [
    {
      id: 'patient',
      header: copy.colPatient,
      mobile: 'primary',
      cell: (r) => (
        <Link href={`/patients/${r.patientId}`} className="font-medium text-ink hover:underline">
          {r.patientName}
        </Link>
      ),
    },
    {
      id: 'amount',
      header: copy.colAmount,
      mobile: 'trailing',
      numeric: true,
      cell: (r) => <span className="font-medium">{money(r)}</span>,
    },
    { id: 'method', header: copy.colMethod, cell: (r) => r.paymentMethodName },
    {
      id: 'reference',
      header: copy.colReference,
      cell: (r) => (r.reference ? <span className="font-mono">{r.reference}</span> : <span className="text-muted">{copy.noReference}</span>),
      mobileCell: (r) => r.reference,
    },
    {
      id: 'paidOn',
      header: copy.colPaidOn,
      cellClassName: 'tabular-nums',
      cell: (r) => stamp.civilDate(r.paidOn, r.locationId),
      mobileCell: (r) => stamp.maybe.civilDate(r.paidOn, r.locationId),
    },
    {
      id: 'proof',
      header: copy.colProof,
      cell: (r) =>
        r.proof ? (
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 max-sm:min-h-11"
            aria-label={copy.viewProofLabel(r.patientName)}
            onClick={() => proofViewer.open(r.id)}
          >
            {copy.viewProof}
          </Button>
        ) : (
          <span className="text-muted">{copy.noProof}</span>
        ),
      mobile: 'hidden',
    },
    {
      id: 'status',
      header: copy.colStatus,
      cell: (r) => <StatusBadge kind="paymentReport" status={r.status} />,
      mobileCell: (r) => statusLabel('paymentReport', r.status),
    },
  ];

  const rowActions = (r: PaymentReport): RowAction[] => [
    ...(r.status === 'PENDING'
      ? [
          { label: copy.confirm, icon: <CheckCircle2 aria-hidden />, onSelect: () => setConfirming(r) },
          ...(r.proof
            ? [{ label: copy.viewProofAction, icon: <FileSearch aria-hidden />, onSelect: () => proofViewer.open(r.id) }]
            : []),
          {
            label: copy.reject,
            icon: <XCircle aria-hidden />,
            destructive: true,
            separatorBefore: true,
            onSelect: () => setRejecting(r),
          },
        ]
      : r.proof
        ? [{ label: copy.viewProofAction, icon: <FileSearch aria-hidden />, onSelect: () => proofViewer.open(r.id) }]
        : []),
  ];

  return (
    <>
      <PageHeader title={copy.title} description={copy.description} />
      {tabs?.nav}
      <div
        className="flex flex-col gap-3"
        {...(tabs ? { role: 'tabpanel', id: tabs.panelId, 'aria-labelledby': tabs.tabId } : {})}
      >
        <SegmentedControl
          aria-label={copy.filterLabel}
          semantics="toggle"
          fullWidthOnMobile
          value={filter}
          onValueChange={(v) => {
            setFilter(v);
            setPage(1);
          }}
          options={(['PENDING', 'CONFIRMED', 'REJECTED', 'ALL'] as const).map((f) => ({ value: f, label: copy.filters[f] }))}
        />
        <SedeStampNote stamp={stamp} />
        <AsyncSection
          loading={loading}
          error={result?.error ?? null}
          onRetry={() => setReloadKey((k) => k + 1)}
          isEmpty={rows.length === 0}
          emptyTitle={filter === 'PENDING' ? copy.emptyPending : copy.empty}
          emptyDescription={filter === 'PENDING' ? copy.emptyPendingHint : copy.emptyHint}
          emptyIcon={<Inbox aria-hidden />}
          skeleton={<TableSkeleton rows={3} />}
        >
          <p className="t-caption text-muted tnum" aria-live="polite">
            {copy.count(result?.total ?? 0)}
          </p>
          <DataList
            label={copy.tableLabel}
            rows={rows}
            columns={columns}
            getRowKey={(r) => r.id}
            getRowLabel={(r) => copy.rowLabel(r.patientName, money(r))}
            rowActions={rowActions}
          />
          <Pagination
            page={page}
            pageSize={result?.pageSize ?? PAGE_SIZE}
            total={result?.total ?? 0}
            onPageChange={setPage}
            disabled={loading}
          />
        </AsyncSection>
      </div>

      {confirming ? (
        <ConfirmPaymentReportModal
          key={confirming.id}
          open
          onOpenChange={(open) => {
            if (!open) setConfirming(null);
          }}
          token={token}
          report={confirming}
          onViewProof={proofViewer.open}
          onConfirmed={(done: ConfirmedPaymentReport) => {
            setConfirming(null);
            notifySuccess(copy.confirmed);
            setReceiptPaymentId(done.payment.id);
            reload();
          }}
          onStale={stale}
        />
      ) : null}
      {rejecting ? (
        <RejectPaymentReportModal
          key={rejecting.id}
          open
          onOpenChange={(open) => {
            if (!open) setRejecting(null);
          }}
          token={token}
          reportId={rejecting.id}
          subject={`${rejecting.patientName} · ${rejecting.paymentMethodName} · ${money(rejecting)}`}
          onRejected={(done: RejectedPaymentReport) => {
            setRejecting(null);
            notifySuccess(done.patientNotified ? copy.rejectedNotified : copy.rejectedNotNotified);
            reload();
          }}
          onStale={stale}
        />
      ) : null}
      {proofViewer.dialog}
      <PaymentReceiptDialog
        token={token}
        paymentId={receiptPaymentId}
        onOpenChange={(open) => {
          if (!open) setReceiptPaymentId(null);
        }}
      />
    </>
  );
}
