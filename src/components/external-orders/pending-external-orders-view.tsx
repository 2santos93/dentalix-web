'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  EXTERNAL_ORDER_KIND_LABELS,
  listPendingExternalOrders,
  type PendingExternalOrder,
  type PendingExternalOrdersPage,
} from '@/lib/external-orders/external-orders-api';
import { externalOrderAgeLabel } from '@/lib/external-orders/order-age';
import { useLocationsState } from '@/lib/locations/use-locations-state';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { FieldError } from '@/components/errors/field-error';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { ResultCount } from '@/components/shared/list-toolbar';
import { PageHeader } from '@/components/shared/page-header';
import { Pagination } from '@/components/shared/pagination';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { NativeSelect } from '@/components/ui/native-select';

export const pendingExternalOrdersCopy = {
  title: 'Órdenes sin resultado',
  description:
    'Órdenes de estudios y referencias emitidas en la sede que aún no tienen el resultado ligado, las más antiguas primero.',
  location: 'Sede',
  locationsError: 'Sedes sin cargar',
  overdueOnly: (days: number | null) =>
    days === null ? 'Solo vencidas' : `Solo vencidas (más de ${days} ${days === 1 ? 'día' : 'días'})`,
  loadError: 'No pudimos cargar las órdenes sin resultado.',
  empty: 'No hay órdenes sin resultado en esta sede',
  emptyOverdue: 'No hay órdenes vencidas en esta sede',
  emptyHint: 'Cuando se emita una orden, aparecerá aquí hasta que se ligue su resultado en la ficha del paciente.',
  noLocations: 'La clínica no tiene sedes activas.',
  tableLabel: 'Órdenes sin resultado, las más antiguas primero',
  colPatient: 'Paciente',
  colOrder: 'Orden',
  colRecipient: 'Destinatario',
  colIssued: 'Emitida',
  colAge: 'Antigüedad',
  number: (n: string) => `nº ${n}`,
  overdue: 'Vencida',
  openPatient: 'Abrir la ficha de ',
  countNoun: 'orden',
  countNounPlural: 'órdenes',
};

const copy = pendingExternalOrdersCopy;

const PAGE_SIZE = 50;

function patientName(row: PendingExternalOrder): string {
  return `${row.patient.firstName} ${row.patient.lastName}`.trim();
}

/**
 * «Órdenes sin resultado» (DX-572), los cuatro roles: las órdenes emitidas de la
 * sede activa sin resultado ligado, la más antigua primero, con su antigüedad en
 * días civiles de la sede y la marca «Vencida» pasado el plazo de la clínica. Con
 * «Todas las sedes» la lista es de una sede (la API la exige): se elige aquí. La
 * fila abre la pestaña «Órdenes» de la ficha, donde se liga el resultado.
 */
export function PendingExternalOrdersView({ token }: { token: string }) {
  const locationsState = useLocationsState(token);
  const [chosenLocationId, setChosenLocationId] = useState<string | null>(null);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PendingExternalOrdersPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const ready = locationsState.status === 'ready' ? locationsState : null;
  const activeLocations = (ready?.locations ?? []).filter((l) => l.isActive);
  const activeLocationId = ready?.activeLocationId ?? null;
  // La sede activa manda; con «Todas las sedes», la elegida aquí o la primera.
  const locationId = activeLocationId ?? chosenLocationId ?? activeLocations[0]?.id ?? null;
  const rows = data?.items ?? [];
  const stamp = useSedeStamp(
    token,
    rows.map((r) => r.order.locationId),
  );

  useEffect(() => {
    if (!locationId) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await listPendingExternalOrders(token, {
          locationId: locationId!,
          overdueOnly,
          page,
          pageSize: PAGE_SIZE,
        });
        if (cancelled) return;
        const lastPage = Math.max(1, Math.ceil(res.total / res.pageSize));
        if (res.items.length === 0 && page > lastPage) {
          setPage(lastPage);
          return;
        }
        setData(res);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(apiErrorMessage(err, copy.loadError));
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, locationId, overdueOnly, page, reloadKey]);

  const columns: DataListColumn<PendingExternalOrder>[] = [
    {
      id: 'patient',
      header: copy.colPatient,
      mobile: 'primary',
      cell: (row) => (
        <>
          <span className="sr-only">{copy.openPatient}</span>
          {patientName(row)}
        </>
      ),
    },
    {
      id: 'order',
      header: copy.colOrder,
      cell: (row) => (
        <span className="flex flex-col">
          <span>{EXTERNAL_ORDER_KIND_LABELS[row.order.kind]}</span>
          <span className="t-id t-caption text-muted">{copy.number(row.order.numberLabel)}</span>
        </span>
      ),
      mobileCell: (row) => `${EXTERNAL_ORDER_KIND_LABELS[row.order.kind]} ${copy.number(row.order.numberLabel)}`,
    },
    {
      id: 'recipient',
      header: copy.colRecipient,
      cell: (row) => <span className="[overflow-wrap:anywhere]">{row.order.recipient}</span>,
      mobileCell: (row) => row.order.recipient,
    },
    {
      id: 'issued',
      header: copy.colIssued,
      cellClassName: 'tabular-nums',
      cell: (row) => stamp.date(row.order.issuedAt, row.order.locationId),
      mobileCell: (row) => stamp.maybe.date(row.order.issuedAt, row.order.locationId),
    },
    {
      id: 'age',
      header: copy.colAge,
      mobile: 'trailing',
      cell: (row) => (
        <span className="inline-flex flex-wrap items-center justify-end gap-2">
          <span className="tabular-nums">{externalOrderAgeLabel(row.ageDays)}</span>
          {row.overdue ? <Badge variant="danger">{copy.overdue}</Badge> : null}
        </span>
      ),
      align: 'end',
    },
  ];

  const overdueDays = data?.overdueDays ?? null;
  const noLocations = ready !== null && activeLocations.length === 0;

  return (
    <div className="flex flex-col">
      <PageHeader title={copy.title} description={copy.description} />
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* Con una sede activa, la del selector global; con «Todas», una aquí. */}
          {activeLocationId === null ? (
            locationsState.status === 'error' ? (
              <FieldError label={copy.locationsError} onRetry={locationsState.retry} className="h-10 sm:w-64" />
            ) : activeLocations.length > 1 ? (
              <NativeSelect
                aria-label={copy.location}
                value={locationId ?? ''}
                onChange={(e) => {
                  setChosenLocationId(e.target.value);
                  setPage(1);
                }}
                className="sm:w-64"
              >
                {activeLocations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </NativeSelect>
            ) : null
          ) : null}
          <Checkbox
            label={copy.overdueOnly(overdueDays)}
            checked={overdueOnly}
            onChange={(e) => {
              setOverdueOnly(e.target.checked);
              setPage(1);
            }}
          />
        </div>

        <SedeStampNote stamp={stamp} />

        <AsyncSection
          loading={!noLocations && (loading || locationId === null)}
          error={error}
          onRetry={() => setReloadKey((k) => k + 1)}
          isEmpty={noLocations || rows.length === 0}
          emptyTitle={noLocations ? copy.noLocations : overdueOnly ? copy.emptyOverdue : copy.empty}
          emptyDescription={noLocations ? undefined : copy.emptyHint}
          emptyIcon={<ClipboardCheck aria-hidden />}
          skeleton={<TableSkeleton rows={4} />}
        >
          <ResultCount total={data?.total ?? 0} noun={copy.countNoun} nounPlural={copy.countNounPlural} />
          <DataList
            label={copy.tableLabel}
            rows={rows}
            columns={columns}
            getRowKey={(row) => row.order.id}
            getRowHref={(row) => `/patients/${row.patient.id}?tab=external-orders`}
            getRowLabel={(row) => patientName(row)}
          />
        </AsyncSection>
        {!error ? (
          <Pagination
            page={page}
            pageSize={data?.pageSize ?? 0}
            total={data?.total ?? 0}
            onPageChange={setPage}
            disabled={loading}
          />
        ) : null}
      </div>
    </div>
  );
}
