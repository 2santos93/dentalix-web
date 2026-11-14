'use client';
import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  getCreditMovements,
  type CreditRefund,
  type CreditTransferMovement,
  type PatientCreditMovements,
} from '@/lib/patient-credit/patient-credit-api';
import { PAYMENT_METHOD_LABELS } from '@/lib/payments/payment-method';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { SectionError } from '@/components/errors/section-error';
import { EmptyState } from '@/components/shared/empty-state';
import { TableSkeleton } from '@/components/shared/async-section';
import { Badge } from '@/components/ui/badge';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { SectionHeader } from '@/components/ui/section-header';

/** El título del historial: a él vuelve el foco tras un traspaso o al cerrar un comprobante recién emitido. */
export const CREDIT_MOVEMENTS_HEADING_ID = 'credit-movements-heading';

const copy = {
  heading: 'Traspasos y devoluciones',
  hint: 'Cada vez que el saldo a favor se aplicó a otro plan o se devolvió al paciente. Una devolución se reimprime con su comprobante.',
  loadError: 'No pudimos cargar los traspasos y devoluciones.',
  emptyTitle: 'Aún no hay traspasos ni devoluciones',
  emptyHint: 'Cuando el saldo a favor de un plan se aplique a otro o se devuelva, queda aquí con su motivo y quién lo hizo.',
  colDate: 'Fecha',
  colKind: 'Movimiento',
  colRoute: 'Origen y destino',
  colReason: 'Motivo',
  colBy: 'Quién',
  colAmount: 'Importe',
  transfer: 'Traspaso',
  refund: 'Devolución',
  patient: 'Paciente',
  reprint: 'Reimprimir comprobante',
};

type Row =
  | { kind: 'transfer'; id: string; at: string; locationId: string; data: CreditTransferMovement }
  | { kind: 'refund'; id: string; at: string; locationId: string; data: CreditRefund };

function rowsOf(movements: PatientCreditMovements): Row[] {
  const rows: Row[] = [
    ...movements.transfers.map((t): Row => ({ kind: 'transfer', id: t.id, at: t.createdAt, locationId: t.locationId, data: t })),
    ...movements.refunds.map((r): Row => ({ kind: 'refund', id: r.id, at: r.createdAt, locationId: r.locationId, data: r })),
  ];
  return rows.sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
}

interface CreditMovementsSectionProps {
  token: string;
  patientId: string;
  planName: (planId: string) => string;
  /** Cambia tras un traspaso o una devolución: vuelve a pedir el historial. */
  reloadKey?: number;
  /** Abre el comprobante de una devolución para reimprimirlo. */
  onOpenReceipt: (refund: CreditRefund) => void;
}

/**
 * «Traspasos y devoluciones» del estado de cuenta (DX-432): el historial del
 * saldo a favor del paciente, visible aunque hoy el saldo sea 0. Fechas e
 * importes con el formato de la sede de cada movimiento (importe con código
 * ISO). Carga, vacío y error siguen la escalera de `src/components/errors`.
 */
export function CreditMovementsSection({ token, patientId, planName, reloadKey = 0, onOpenReceipt }: CreditMovementsSectionProps) {
  const [data, setData] = useState<PatientCreditMovements | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const stamp = useSedeStamp(
    token,
    data ? [...data.transfers.map((t) => t.locationId), ...data.refunds.map((r) => r.locationId)] : [],
  );

  useEffect(() => {
    let cancelled = false;
    getCreditMovements(token, patientId)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setError(null);
      })
      .catch((err: unknown) => {
        // Escalón 1: la sección no tiene nada que mostrar. Con datos ya en pantalla se conservan.
        if (!cancelled) setError(apiErrorMessage(err, { fallback: copy.loadError }));
      });
    return () => {
      cancelled = true;
    };
  }, [token, patientId, reloadKey, retryKey]);

  const rows = data ? rowsOf(data) : [];

  const columns: DataListColumn<Row>[] = [
    {
      id: 'date',
      header: copy.colDate,
      mobile: 'primary',
      cell: (row) => <span className="tabular-nums">{stamp.dateTime(row.at, row.locationId)}</span>,
    },
    {
      id: 'kind',
      header: copy.colKind,
      cell: (row) => (
        <Badge variant={row.kind === 'refund' ? 'warning' : 'neutral'}>{row.kind === 'refund' ? copy.refund : copy.transfer}</Badge>
      ),
      mobileCell: (row) => (row.kind === 'refund' ? copy.refund : copy.transfer),
    },
    {
      id: 'route',
      header: copy.colRoute,
      cell: (row) => <span className="break-words">{routeOf(row, planName)}</span>,
      mobileCell: (row) => routeOf(row, planName),
    },
    {
      id: 'reason',
      header: copy.colReason,
      cell: (row) => <span className="break-words text-muted">{reasonOf(row) ?? '—'}</span>,
      mobileCell: (row) => reasonOf(row),
    },
    {
      id: 'by',
      header: copy.colBy,
      cell: (row) => <span className="text-muted">{byOf(row) ?? '—'}</span>,
      mobileCell: (row) => byOf(row),
    },
    {
      id: 'amount',
      header: copy.colAmount,
      numeric: true,
      mobile: 'trailing',
      cell: (row) => (
        <span className="t-data whitespace-nowrap font-medium text-ink">{stamp.money(row.data.amount, row.data.currency, row.locationId)}</span>
      ),
    },
  ];

  return (
    <section aria-labelledby={CREDIT_MOVEMENTS_HEADING_ID} className="flex flex-col gap-3" data-testid="credit-movements">
      <SectionHeader as="h3" titleId={CREDIT_MOVEMENTS_HEADING_ID} title={copy.heading} description={copy.hint} titleFocusable />
      <SedeStampNote stamp={stamp} />
      {error && !data ? (
        <SectionError description={error} onRetry={() => setRetryKey((k) => k + 1)} />
      ) : !data ? (
        <TableSkeleton rows={2} />
      ) : rows.length === 0 ? (
        <EmptyState role="status" title={copy.emptyTitle} description={copy.emptyHint} />
      ) : (
        <DataList
          label={copy.heading}
          rows={rows}
          columns={columns}
          getRowKey={(row) => `${row.kind}-${row.id}`}
          getRowLabel={(row) => `${row.kind === 'refund' ? copy.refund : copy.transfer} ${stamp.maybe.date(row.at, row.locationId) ?? ''}`.trim()}
          rowActions={(row) =>
            row.kind === 'refund'
              ? [{ label: copy.reprint, icon: <Printer aria-hidden />, onSelect: () => onOpenReceipt(row.data) }]
              : []
          }
        />
      )}
    </section>
  );
}

function routeOf(row: Row, planName: (planId: string) => string): string {
  if (row.kind === 'transfer') return `${planName(row.data.sourcePlanId)} → ${planName(row.data.targetPlanId)}`;
  return `${planName(row.data.treatmentPlanId)} → ${copy.patient} (${PAYMENT_METHOD_LABELS[row.data.method]}) · ${row.data.number}`;
}

function reasonOf(row: Row): string | null {
  return row.data.reason;
}

function byOf(row: Row): string | null {
  return row.kind === 'transfer' ? row.data.createdByName : row.data.snapshot.refundedBy.fullName;
}
