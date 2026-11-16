'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Factory, Users } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { useMediaQuery } from '@/lib/hooks/use-media-query';
import {
  LAB_ORDER_OPEN_STATUSES,
  LAB_ORDER_STATUSES,
  labOrderNumberLabel,
  labOrdersTabHref,
  listDentalLabs,
  listLabOrders,
  teethLabel,
  type DentalLab,
  type LabOrder,
  type LabOrderPage,
  type LabOrderStatus,
} from '@/lib/lab-orders/lab-orders-api';
import { statusLabel } from '@/lib/status/tones';
import { useLocationsState } from '@/lib/locations/use-locations-state';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { FieldError } from '@/components/errors/field-error';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { Disclosure } from '@/components/shared/disclosure';
import { ResultCount } from '@/components/shared/list-toolbar';
import { PageHeader } from '@/components/shared/page-header';
import { Pagination } from '@/components/shared/pagination';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DataList, DATA_LIST_PHONE_QUERY, type DataListColumn } from '@/components/ui/data-list';
import { NativeSelect } from '@/components/ui/native-select';
import { cn } from '@/lib/utils';
import { LabOrderStatusChips } from './lab-order-status';

export const labOrdersViewCopy = {
  title: 'Trabajos de laboratorio',
  description:
    'Las órdenes del laboratorio dental de la sede: lo que está fuera, cuándo lo prometieron y lo que ya llegó. Las atrasadas, primero.',
  filters: 'Filtros',
  activeFilters: (n: number) => (n === 1 ? '1 activo' : `${n} activos`),
  location: 'Sede',
  locationsError: 'Sedes sin cargar',
  status: 'Estado',
  statusOpen: 'Pendientes',
  statusAll: 'Todos los estados',
  lab: 'Laboratorio',
  labAll: 'Todos los laboratorios',
  labsError: 'Laboratorios sin cargar',
  overdueOnly: 'Solo atrasados',
  loadError: 'No pudimos cargar los trabajos de laboratorio.',
  empty: 'Aún no hay trabajos de laboratorio',
  emptyFiltered: 'Ningún trabajo con estos filtros',
  emptyOverdue: 'No hay trabajos atrasados en esta sede',
  emptyHint: 'Las órdenes se crean en la ficha del paciente, sección «Laboratorio», o desde un ítem de su plan.',
  noLocations: 'La clínica no tiene sedes activas.',
  tableLabel: 'Trabajos de laboratorio de la sede, los atrasados primero',
  colPatient: 'Paciente',
  colWork: 'Trabajo',
  colLab: 'Laboratorio',
  colDue: 'Fecha prometida',
  colStatus: 'Estado',
  noDue: 'Sin fecha',
  dueOn: (date: string) => `Prometida ${date}`,
  goToPatients: 'Ir a Pacientes',
  openPatient: 'Abrir la ficha de ',
  countNoun: 'trabajo',
  countNounPlural: 'trabajos',
};

const copy = labOrdersViewCopy;
const PAGE_SIZE = 50;

type StatusFilter = 'OPEN' | 'ALL' | LabOrderStatus;

function statusesOf(filter: StatusFilter): readonly LabOrderStatus[] {
  if (filter === 'OPEN') return LAB_ORDER_OPEN_STATUSES;
  if (filter === 'ALL') return [];
  return [filter];
}

/**
 * «Trabajos de laboratorio» (DX-017), los cuatro roles: las órdenes del
 * laboratorio dental de la sede activa (con «Todas las sedes», una elegida
 * aquí: la API lista por sede), las atrasadas primero con sus días de atraso
 * en rojo. Filtros de estado (por defecto, las pendientes), laboratorio y
 * «Solo atrasados»; en el teléfono, tarjetas y los filtros en un desplegable.
 * La fila abre la sección «Laboratorio» de la ficha, donde se dan los pasos.
 */
export function LabOrdersView({ token }: { token: string }) {
  const isPhone = useMediaQuery(DATA_LIST_PHONE_QUERY);
  const locationsState = useLocationsState(token);
  const [chosenLocationId, setChosenLocationId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('OPEN');
  const [labId, setLabId] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LabOrderPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [labs, setLabs] = useState<DentalLab[] | null>(null);
  const [labsFailed, setLabsFailed] = useState(false);
  const [labsReload, setLabsReload] = useState(0);

  const ready = locationsState.status === 'ready' ? locationsState : null;
  const activeLocations = (ready?.locations ?? []).filter((l) => l.isActive);
  const activeLocationId = ready?.activeLocationId ?? null;
  // La sede activa manda; con «Todas las sedes», la elegida aquí o la primera.
  const locationId = activeLocationId ?? chosenLocationId ?? activeLocations[0]?.id ?? null;
  const rows = data?.items ?? [];
  const stamp = useSedeStamp(
    token,
    rows.map((r) => r.locationId),
  );

  useEffect(() => {
    let cancelled = false;
    listDentalLabs(token, { includeInactive: true })
      .then((list) => {
        if (cancelled) return;
        setLabs([...list].sort((a, b) => a.name.localeCompare(b.name, 'es')));
        setLabsFailed(false);
      })
      .catch(() => {
        if (!cancelled) setLabsFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token, labsReload]);

  useEffect(() => {
    if (!locationId) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await listLabOrders(token, {
          locationId,
          statuses: statusesOf(statusFilter),
          labId: labId || null,
          overdue: overdueOnly,
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
  }, [token, locationId, statusFilter, labId, overdueOnly, page, reloadKey]);

  const columns: DataListColumn<LabOrder>[] = [
    {
      id: 'patient',
      header: copy.colPatient,
      mobile: 'primary',
      cell: (o) => (
        <>
          <span className="sr-only">{copy.openPatient}</span>
          {o.patient.fullName}
        </>
      ),
    },
    {
      id: 'work',
      header: copy.colWork,
      cell: (o) => (
        <span className="flex min-w-0 flex-col">
          <span className="[overflow-wrap:anywhere]">{o.description}</span>
          <span className="t-id t-caption text-muted">
            {labOrderNumberLabel(o.number)}
            {o.toothNumbers.length > 0 ? ` · ${teethLabel(o.toothNumbers)}` : ''}
          </span>
        </span>
      ),
      mobileCell: (o) => `${o.description} · ${labOrderNumberLabel(o.number)}`,
    },
    {
      id: 'lab',
      header: copy.colLab,
      cell: (o) => (
        <span className="flex min-w-0 flex-col [overflow-wrap:anywhere]">
          <span>{o.lab.name}</span>
          {o.service ? <span className="t-caption text-muted">{o.service.name}</span> : null}
        </span>
      ),
      mobileCell: (o) => o.lab.name,
      showFrom: 'md',
    },
    {
      id: 'due',
      header: copy.colDue,
      cell: (o) => (
        <span className={cn('tabular-nums', o.overdue && 'font-medium text-danger-text')}>
          {o.dueOn ? stamp.civilDate(o.dueOn, o.locationId) : copy.noDue}
        </span>
      ),
      mobileCell: (o) => {
        const day = o.dueOn ? stamp.maybe.civilDate(o.dueOn, o.locationId) : null;
        return day ? <span className={cn(o.overdue && 'font-medium text-danger-text')}>{copy.dueOn(day)}</span> : null;
      },
    },
    {
      id: 'status',
      header: copy.colStatus,
      mobile: 'trailing',
      cell: (o) => <LabOrderStatusChips order={o} />,
    },
  ];

  const noLocations = ready !== null && activeLocations.length === 0;
  const activeFilterCount = (statusFilter !== 'OPEN' ? 1 : 0) + (labId ? 1 : 0) + (overdueOnly ? 1 : 0);

  const filters = (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      {/* Con una sede activa, la del selector global; con «Todas», una aquí. */}
      {activeLocationId === null ? (
        locationsState.status === 'error' ? (
          <FieldError label={copy.locationsError} onRetry={locationsState.retry} className="h-10 sm:w-56" />
        ) : activeLocations.length > 1 ? (
          <NativeSelect
            aria-label={copy.location}
            value={locationId ?? ''}
            onChange={(e) => {
              setChosenLocationId(e.target.value);
              setPage(1);
            }}
            className="sm:w-56"
          >
            {activeLocations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </NativeSelect>
        ) : null
      ) : null}
      <NativeSelect
        aria-label={copy.status}
        value={statusFilter}
        onChange={(e) => {
          setStatusFilter(e.target.value as StatusFilter);
          setPage(1);
        }}
        className="sm:w-52"
      >
        <option value="OPEN">{copy.statusOpen}</option>
        <option value="ALL">{copy.statusAll}</option>
        {LAB_ORDER_STATUSES.map((s) => (
          <option key={s} value={s}>
            {statusLabel('labOrder', s)}
          </option>
        ))}
      </NativeSelect>
      {labsFailed ? (
        <FieldError
          label={copy.labsError}
          onRetry={() => {
            setLabsFailed(false);
            setLabsReload((k) => k + 1);
          }}
          className="h-10 sm:w-56"
        />
      ) : (
        <NativeSelect
          aria-label={copy.lab}
          value={labId}
          disabled={labs === null}
          onChange={(e) => {
            setLabId(e.target.value);
            setPage(1);
          }}
          className="sm:w-56"
        >
          <option value="">{copy.labAll}</option>
          {(labs ?? []).map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </NativeSelect>
      )}
      <Checkbox
        label={copy.overdueOnly}
        checked={overdueOnly}
        onChange={(e) => {
          setOverdueOnly(e.target.checked);
          setPage(1);
        }}
      />
    </div>
  );

  const emptyTitle = noLocations
    ? copy.noLocations
    : overdueOnly
      ? copy.emptyOverdue
      : statusFilter !== 'OPEN' || labId
        ? copy.emptyFiltered
        : copy.empty;

  return (
    <div className="flex flex-col">
      <PageHeader title={copy.title} description={copy.description} />
      <div className="flex flex-col gap-3">
        {isPhone ? (
          <Disclosure
            summary={copy.filters}
            meta={activeFilterCount > 0 ? copy.activeFilters(activeFilterCount) : undefined}
            className="rounded-lg border border-border bg-surface"
          >
            <div className="px-2 pb-3">{filters}</div>
          </Disclosure>
        ) : (
          filters
        )}

        <SedeStampNote stamp={stamp} />

        <AsyncSection
          loading={!noLocations && (loading || locationId === null)}
          error={error}
          onRetry={() => setReloadKey((k) => k + 1)}
          isEmpty={noLocations || rows.length === 0}
          emptyTitle={emptyTitle}
          emptyDescription={noLocations ? undefined : copy.emptyHint}
          emptyIcon={<Factory aria-hidden />}
          emptyAction={
            !noLocations && emptyTitle === copy.empty ? (
              <Button asChild variant="secondary">
                <Link href="/patients">
                  <Users aria-hidden />
                  {copy.goToPatients}
                </Link>
              </Button>
            ) : null
          }
          skeleton={<TableSkeleton rows={4} />}
        >
          <ResultCount total={data?.total ?? 0} noun={copy.countNoun} nounPlural={copy.countNounPlural} />
          <DataList
            label={copy.tableLabel}
            rows={rows}
            columns={columns}
            getRowKey={(o) => o.id}
            getRowHref={(o) => labOrdersTabHref(o.patient.id)}
            getRowLabel={(o) => o.patient.fullName}
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
