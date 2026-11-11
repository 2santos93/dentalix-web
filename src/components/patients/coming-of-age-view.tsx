'use client';
import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Cake, Lock, UserCheck } from 'lucide-react';
import { ApiError } from '@/lib/api/api-error';
import { apiErrorMessage } from '@/lib/api/error-message';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { useLocationsState } from '@/lib/locations/use-locations-state';
import { wallDay } from '@/lib/time/wall-clock';
import {
  civilMonthRange,
  listComingOfAge,
  sortComingOfAge,
  type ComingOfAgeItem,
  type ComingOfAgeList,
} from '@/lib/patients/majority-review-api';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { ResultCount } from '@/components/shared/list-toolbar';
import { PageHeader } from '@/components/shared/page-header';
import type { RowAction } from '@/components/shared/row-actions';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { StatusBadge } from '@/components/ui/status-badge';
import { MajorityReviewDialog } from './majority-review-dialog';

export const comingOfAgeCopy = {
  title: 'Cumplen la mayoría de edad',
  description:
    'Pacientes con un responsable de cuando eran menores que cumplen la mayoría de edad: revisa a quién van sus avisos y recibos.',
  back: 'Pacientes',
  rangeLabel: 'Periodo',
  thisMonth: 'Este mes',
  nextMonth: 'Mes siguiente',
  listLabel: 'Pacientes que cumplen la mayoría de edad',
  countNoun: 'paciente',
  countNounPlural: 'pacientes',
  colPatient: 'Paciente',
  colBirth: 'Nacimiento',
  colMajority: 'Mayoría de edad',
  colResponsibles: 'Responsables',
  colStatus: 'Estado',
  colLocation: 'Sede',
  responsibles: (n: number) => (n === 1 ? '1 responsable' : `${n} responsables`),
  notApplicable: '—',
  notApplicableLabel: 'Sin revisión',
  review: 'Revisar',
  openRecord: 'Abrir ficha',
  restricted: 'Ves solo los pacientes atendidos en tus sedes.',
  emptyTitle: (thisMonth: boolean) =>
    thisMonth ? 'Nadie cumple la mayoría de edad este mes' : 'Nadie cumple la mayoría de edad el mes siguiente',
  emptyHint:
    'Aquí aparecen los pacientes con un responsable registrado cuando eran menores. Los adultos con responsable no necesitan revisión.',
  loadError: 'No pudimos cargar los pacientes que cumplen la mayoría de edad.',
  forbiddenTitle: 'Tu rol no tiene acceso a esta lista.',
  forbiddenHint: 'La revisan recepción y administración. Pídele acceso a quien administra la clínica.',
};
const copy = comingOfAgeCopy;

type Range = 'THIS_MONTH' | 'NEXT_MONTH';

const recordHref = (item: ComingOfAgeItem) => `/patients/${encodeURIComponent(item.patientId)}`;

function StatusCell({ item }: { item: ComingOfAgeItem }) {
  if (item.status === 'NOT_APPLICABLE') {
    return (
      <span className="text-muted" aria-label={copy.notApplicableLabel}>
        {copy.notApplicable}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <StatusBadge kind="majorityReview" status={item.status} />
      {item.status === 'PENDING' && item.overdue ? <StatusBadge kind="majorityReview" status="OVERDUE" /> : null}
    </span>
  );
}

/**
 * DX-342: «Cumplen la mayoría de edad», para recepción y ADMIN. Vive bajo
 * Pacientes (el menú ya está en su presupuesto de 15 entradas, DESIGN.md →
 * Navigation): se llega desde la barra de la lista de pacientes. El mes es el
 * de la sede de la pantalla; las pendientes vencidas van primero. «Revisar»
 * abre la revisión en un modal; toda la fila abre la ficha.
 */
export function ComingOfAgeView({ token }: { token: string }) {
  const router = useRouter();
  const stamp = useSedeStamp(token);
  // La sede del paciente solo dice algo cuando la clínica tiene más de una.
  const locationsState = useLocationsState(token);
  const multiSede = locationsState.status === 'ready' && locationsState.locations.length > 1;
  const timeZone = stamp.clock?.timeZone ?? null;
  const [range, setRange] = useState<Range>('THIS_MONTH');
  const [data, setData] = useState<ComingOfAgeList | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [reviewing, setReviewing] = useState<ComingOfAgeItem | null>(null);

  // El día civil de la sede (no el del navegador) decide qué es «este mes».
  const period = useMemo(() => {
    if (!timeZone) return null;
    return civilMonthRange(wallDay(new Date(), timeZone), range === 'THIS_MONTH' ? 0 : 1);
  }, [timeZone, range]);

  useEffect(() => {
    if (!period) return;
    let cancelled = false;
    async function load(from: string, to: string) {
      setLoading(true);
      try {
        const res = await listComingOfAge(token, { from, to });
        if (cancelled) return;
        setData(res);
        setLoadError(null);
        setForbidden(false);
      } catch (err) {
        if (cancelled) return;
        setForbidden(err instanceof ApiError && err.status === 403);
        setLoadError(apiErrorMessage(err, { fallback: copy.loadError }));
      }
      if (!cancelled) setLoading(false);
    }
    void load(period.from, period.to);
    return () => {
      cancelled = true;
    };
  }, [token, period, reloadKey]);

  const items = useMemo(() => sortComingOfAge(data?.items ?? []), [data]);

  function rowActions(item: ComingOfAgeItem): RowAction[] {
    const actions: RowAction[] = [];
    if (item.status !== 'NOT_APPLICABLE') {
      actions.push({ label: copy.review, icon: <UserCheck aria-hidden />, onSelect: () => setReviewing(item) });
    }
    actions.push({ label: copy.openRecord, onSelect: () => router.push(recordHref(item)) });
    return actions;
  }

  const columns: DataListColumn<ComingOfAgeItem>[] = [
    {
      id: 'patient',
      header: copy.colPatient,
      mobile: 'primary',
      cell: (r) => (
        <span className="block min-w-[9rem]">
          <span className="block">{r.fullName}</span>
          <span className="block text-xs font-normal text-muted tabular-nums">{r.patientCode}</span>
        </span>
      ),
      mobileCell: (r) => r.fullName,
    },
    {
      id: 'status',
      header: copy.colStatus,
      mobile: 'trailing',
      cell: (r) => <StatusCell item={r} />,
    },
    {
      id: 'majority',
      header: copy.colMajority,
      headerClassName: 'whitespace-nowrap',
      cell: (r) => <span className="whitespace-nowrap tabular-nums">{stamp.civilDate(r.majorityDate)}</span>,
      mobileCell: (r) => {
        const d = stamp.maybe.civilDate(r.majorityDate);
        return d ? `${copy.colMajority}: ${d}` : null;
      },
    },
    {
      id: 'birth',
      header: copy.colBirth,
      showFrom: 'md',
      cell: (r) => <span className="whitespace-nowrap tabular-nums">{stamp.civilDate(r.birthDate)}</span>,
      mobileCell: (r) => {
        const d = stamp.maybe.civilDate(r.birthDate);
        return d ? `${copy.colBirth}: ${d}` : null;
      },
    },
    ...(multiSede
      ? [
          {
            id: 'location',
            header: copy.colLocation,
            cell: (r) => (r.locationName ? <span className="[overflow-wrap:anywhere]">{r.locationName}</span> : null),
            mobileCell: (r) => r.locationName,
          } satisfies DataListColumn<ComingOfAgeItem>,
        ]
      : []),
    {
      id: 'responsibles',
      header: copy.colResponsibles,
      cell: (r) => <span className="whitespace-nowrap">{copy.responsibles(r.responsiblesCount)}</span>,
      mobileCell: (r) => copy.responsibles(r.responsiblesCount),
    },
  ];

  return (
    <>
      <PageHeader title={copy.title} description={copy.description} back={{ href: '/patients', label: copy.back }} />
      <div className="flex flex-col gap-3">
        {!forbidden ? (
          <SegmentedControl<Range>
            aria-label={copy.rangeLabel}
            value={range}
            onValueChange={setRange}
            options={[
              { value: 'THIS_MONTH', label: copy.thisMonth },
              { value: 'NEXT_MONTH', label: copy.nextMonth },
            ]}
            fullWidthOnMobile
            data-testid="coming-of-age-range"
          />
        ) : null}
        <SedeStampNote stamp={stamp} />
        {data?.restrictedToLocations && !forbidden ? <p className="text-sm text-muted">{copy.restricted}</p> : null}

        {!period && stamp.notice ? null : forbidden ? (
          <EmptyState role="status" icon={<Lock aria-hidden />} title={copy.forbiddenTitle} description={copy.forbiddenHint} />
        ) : (
          <AsyncSection
            loading={loading}
            error={loadError}
            onRetry={() => setReloadKey((k) => k + 1)}
            isEmpty={items.length === 0}
            emptyTitle={copy.emptyTitle(range === 'THIS_MONTH')}
            emptyDescription={copy.emptyHint}
            emptyIcon={<Cake aria-hidden />}
            skeleton={<TableSkeleton rows={4} />}
          >
            <ResultCount total={items.length} noun={copy.countNoun} nounPlural={copy.countNounPlural} />
            <DataList
              label={copy.listLabel}
              rows={items}
              columns={columns}
              getRowKey={(r) => r.patientId}
              getRowHref={recordHref}
              getRowLabel={(r) => r.fullName}
              rowActions={rowActions}
            />
          </AsyncSection>
        )}
      </div>

      {reviewing ? (
        <MajorityReviewDialog
          open
          onOpenChange={(open) => {
            if (!open) setReviewing(null);
          }}
          token={token}
          patientId={reviewing.patientId}
          patientName={reviewing.fullName}
          stamp={stamp}
          onReviewed={() => setReloadKey((k) => k + 1)}
        />
      ) : null}
    </>
  );
}
