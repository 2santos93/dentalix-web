'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Building2, CalendarDays, Lock, UserRound } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { readyTimeZone, sedeToday, useSedeTimeZone } from '@/lib/locations/use-sede-time-zone';
import { readyFormat, useSedeFormat } from '@/lib/locations/use-sede-format';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { moneyWithCode } from '@/lib/format/sede-number';
import { isCivilDate } from '@/lib/reports/chair-occupancy-api';
import { treatmentPlanHref } from '@/lib/patients/patient-tab-access';
import {
  appointmentHref,
  getScheduledProduction,
  getScheduledProductionUnlinked,
  isScheduledPreset,
  isValidScheduledPeriod,
  SCHEDULED_PRESETS,
  scheduledPeriodFor,
  type ScheduledPresetKey,
  type ScheduledProductionDay,
  type ScheduledProductionDefinition,
  type ScheduledProductionFilters,
  type ScheduledProductionProfessional,
  type ScheduledProductionReport,
  type ScheduledProductionUnlinked,
  type UnlinkedAppointment,
} from '@/lib/reports/scheduled-production-api';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { InlineError } from '@/components/errors/inline-error';
import { Callout } from '@/components/ui/callout';
import { Card } from '@/components/ui/card';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { DateRangePicker } from '@/components/ui/date-picker';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { Disclosure } from '@/components/shared/disclosure';
import { EmptyState } from '@/components/shared/empty-state';
import { FormField } from '@/components/shared/form-field';
import { Pagination } from '@/components/shared/pagination';
import { cn } from '@/lib/utils';
import { HowCalculated } from './how-calculated';
import { Stat, StatGroup } from './stat-group';

export const scheduledProductionCopy = {
  scopeClinic: 'Agenda de la clínica',
  scopeOwn: 'Solo lo tuyo: las citas que atiendes y lo que realizaste',
  scopeAllLocations: 'consolidado de tus sedes',
  scopeLocation: (name: string) => `sede ${name}`,
  scopeCurrency: (currency: string) => `Importes en ${currency}`,
  period: 'Período',
  dates: 'Fechas',
  from: 'Desde',
  to: 'Hasta',
  location: 'Sede de la cita',
  locationAll: 'Todas tus sedes',
  professional: 'Profesional de la cita',
  professionalAll: 'Todo el equipo',
  inactive: '(desactivada)',
  forecastTitle: 'Previsión del mes',
  forecastMonth: (month: string, today: string) => `${month} · hoy ${today}`,
  formula: 'Producido hasta hoy + Agendado pendiente = Previsión',
  produced: 'Producido hasta hoy',
  producedHint: 'Realizado desde el día 1, hoy incluido',
  pending: 'Agendado pendiente',
  pendingHint: 'Aceptado en citas de hoy a fin de mes',
  forecast: 'Previsión',
  forecastHint: 'Lo que se cerraría el mes si se atiende lo agendado',
  forecastIndependent: 'La previsión es siempre del mes en curso, con la sede y el profesional elegidos; no depende del período.',
  mixedMonths:
    'Alguna de tus sedes ya está en otro mes por su zona horaria: cada sede suma su propio mes y su «hoy».',
  periodTitle: 'Agendado del período',
  periodLine: (from: string, to: string) => (from === to ? `Citas del ${from}` : `Citas del ${from} al ${to}`),
  scheduled: 'Agendado',
  scheduledHint: 'Aceptados y realizados ligados a citas que cuentan',
  appointments: 'Citas',
  appointmentsHint: 'Ni canceladas ni inasistencias',
  withoutItems: 'Sin tratamiento ligado',
  withoutItemsHint: 'Citas que no suman: no tienen ítems del plan',
  byDayTitle: 'Por día',
  byDayLabel: 'Agendado por día',
  byProfessionalTitle: 'Por profesional',
  byProfessionalLabel: 'Agendado por profesional',
  columns: {
    date: 'Fecha',
    professional: 'Profesional',
    scheduled: 'Agendado',
    appointments: 'Citas',
    withoutItems: 'Sin tratamiento',
  },
  withoutItemsMeta: (n: string) => `${n} sin tratamiento`,
  appointmentsMeta: (n: number, text: string) => `${text} ${n === 1 ? 'cita' : 'citas'}`,
  unlinkedTitle: 'Citas sin tratamiento ligado',
  unlinkedCaption:
    'Cuentan como citas pero no suman: liga sus procedimientos desde el plan del paciente o desde la propia cita.',
  unlinkedLabel: 'Citas sin tratamiento ligado',
  unlinkedColumns: {
    when: 'Cita',
    patient: 'Paciente',
    type: 'Tipo',
    professional: 'Profesional',
    location: 'Sede',
    open: 'Agenda',
  },
  openAppointment: 'Abrir la cita',
  openAppointmentFor: (patient: string) => `Abrir la cita de ${patient} en la agenda`,
  openPlanFor: (patient: string) => `Plan de tratamiento de ${patient}`,
  unlinkedError: 'No pudimos cargar las citas sin tratamiento ligado.',
  unattributed: 'Sin profesional',
  howTitle: 'Cómo se calcula',
  restricted: 'Solo incluye tus sedes.',
  noCatalogCurrency:
    'La clínica no tiene una moneda de catálogo que se pueda resolver: se cuentan las citas, pero no hay importes.',
  withoutRate: (n: number) =>
    `${n === 1 ? '1 cita tiene' : `${n} citas tienen`} procedimientos en otra moneda sin tasa guardada del día: ${n === 1 ? 'cuenta' : 'cuentan'} como cita pero no en los importes.`,
  forecastWithoutRate: (n: number) =>
    `${n === 1 ? '1 procedimiento' : `${n} procedimientos`} de la previsión ${n === 1 ? 'queda' : 'quedan'} fuera de los importes por falta de tasa guardada.`,
  unattributedDone: (n: number) =>
    `${n === 1 ? '1 procedimiento realizado no tiene' : `${n} procedimientos realizados no tienen`} sede o fecha de realización (registros antiguos): no ${n === 1 ? 'entra' : 'entran'} en lo producido.`,
  noValue: '—',
  loadError: 'No pudimos cargar la producción agendada.',
  badRequest: 'El período no es válido: elige fechas de hasta 62 días con «Desde» anterior o igual a «Hasta».',
  forbiddenTitle: 'Tu rol no tiene acceso a la producción agendada.',
  forbiddenHint:
    'La ven la administración, los odontólogos (cada uno, lo suyo) y quien tenga acceso a los reportes financieros.',
  empty: 'Sin citas en el período',
  emptyHint: 'No hay citas que cuenten en estas fechas con estos filtros. Prueba con otro período, sede o profesional.',
  loading: 'Cargando la producción agendada',
};

const LOCATION_TIMEZONE_REQUIRED = 'LOCATION_TIMEZONE_REQUIRED';
const UNLINKED_PAGE_SIZE = 25;

/** Un importe en la moneda del catálogo o «—» (sin moneda). */
function amountText(amount: number | null, currency: string | null, fmt: RegionalFormat): string {
  return amount === null || currency === null ? scheduledProductionCopy.noValue : moneyWithCode(amount, currency, fmt);
}

/** «2026-11» → «noviembre de 2026». */
function monthText(month: string, fmt: RegionalFormat): string {
  return fmt.civilLongDate(`${month}-01`, { weekday: false }).replace(/^1 de /, '');
}

function definitionText(
  definitions: readonly ScheduledProductionDefinition[],
  key: ScheduledProductionDefinition['key'],
): string | null {
  const def = definitions.find((d) => d.key === key);
  return def ? def.howItIsCalculated.join(' ') : null;
}

function HeaderWithHow({
  label,
  definitions,
  definition,
}: {
  label: string;
  definitions: readonly ScheduledProductionDefinition[];
  definition: ScheduledProductionDefinition['key'];
}) {
  const text = definitionText(definitions, definition);
  return (
    <span className="inline-flex items-center justify-end gap-0.5">
      {label}
      {text ? <HowCalculated column={label} text={text} /> : null}
    </span>
  );
}

/** La previsión del mes en curso: los dos sumandos y su resultado, con la fórmula a la vista. */
function ForecastCard({ report, fmt }: { report: ScheduledProductionReport; fmt: RegionalFormat }) {
  const c = scheduledProductionCopy;
  const f = report.forecast;
  const money = (n: number | null) => amountText(n, report.currency, fmt);
  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid="scheduled-production-forecast">
      <StatGroup title={c.forecastTitle} className="grid-cols-1 sm:grid-cols-3">
        <Stat testId="scheduled-production-produced" label={c.produced} value={money(f.producedToDate)} hint={c.producedHint} />
        <Stat
          testId="scheduled-production-pending"
          label={`+ ${c.pending}`}
          value={money(f.scheduledPending)}
          hint={c.pendingHint}
        />
        <Stat
          testId="scheduled-production-forecast-total"
          label={`= ${c.forecast}`}
          value={money(f.forecast)}
          hint={c.forecastHint}
        />
      </StatGroup>
      <p className="t-caption text-muted">
        <span data-testid="scheduled-production-formula" className="font-medium text-ink">
          {c.formula}
        </span>
        {' · '}
        <span data-testid="scheduled-production-month" className="tabular-nums">
          {c.forecastMonth(monthText(f.month, fmt), fmt.civilDate(f.today))}
        </span>
      </p>
      <p className="t-caption text-muted">{c.forecastIndependent}</p>
    </div>
  );
}

function PeriodTotals({ report, fmt }: { report: ScheduledProductionReport; fmt: RegionalFormat }) {
  const c = scheduledProductionCopy;
  return (
    <StatGroup title={c.periodTitle} className="grid-cols-2 sm:grid-cols-3">
      <Stat
        testId="scheduled-production-total"
        label={c.scheduled}
        value={amountText(report.totals.scheduledAmount, report.currency, fmt)}
        hint={c.scheduledHint}
        className="col-span-2 sm:col-span-1"
      />
      <Stat
        testId="scheduled-production-appointments"
        label={c.appointments}
        value={fmt.number(report.totals.appointments)}
        hint={c.appointmentsHint}
      />
      <Stat
        testId="scheduled-production-without-items"
        label={c.withoutItems}
        value={fmt.number(report.totals.appointmentsWithoutItems)}
        hint={c.withoutItemsHint}
      />
    </StatGroup>
  );
}

function ByDayList({ report, fmt }: { report: ScheduledProductionReport; fmt: RegionalFormat }) {
  const c = scheduledProductionCopy;
  const defs = report.definitions;
  const columns: DataListColumn<ScheduledProductionDay>[] = [
    {
      id: 'date',
      header: c.columns.date,
      mobile: 'primary',
      cell: (r) => (
        <span className={cn('whitespace-nowrap tabular-nums', r.appointments === 0 ? 'text-muted' : 'text-ink')}>
          {fmt.civilLongDate(r.date, { year: false })}
        </span>
      ),
    },
    {
      id: 'scheduled',
      header: <HeaderWithHow label={c.columns.scheduled} definitions={defs} definition="SCHEDULED" />,
      numeric: true,
      mobile: 'trailing',
      cell: (r) => <span className="whitespace-nowrap tabular-nums">{amountText(r.scheduledAmount, report.currency, fmt)}</span>,
    },
    {
      id: 'appointments',
      header: c.columns.appointments,
      numeric: true,
      cell: (r) => <span className="tabular-nums">{fmt.number(r.appointments)}</span>,
      mobileCell: (r) => c.appointmentsMeta(r.appointments, fmt.number(r.appointments)),
    },
    {
      id: 'withoutItems',
      header: <HeaderWithHow label={c.columns.withoutItems} definitions={defs} definition="WITHOUT_ITEMS" />,
      numeric: true,
      cell: (r) => <span className="tabular-nums">{fmt.number(r.appointmentsWithoutItems)}</span>,
      mobileCell: (r) => (r.appointmentsWithoutItems > 0 ? c.withoutItemsMeta(fmt.number(r.appointmentsWithoutItems)) : null),
    },
  ];
  return (
    <section className="flex min-w-0 flex-col gap-2" aria-label={c.byDayTitle}>
      <h3 className="t-label text-ink">{c.byDayTitle}</h3>
      <DataList label={c.byDayLabel} rows={report.byDay} columns={columns} getRowKey={(r) => r.date} />
    </section>
  );
}

function ByProfessionalList({ report, fmt }: { report: ScheduledProductionReport; fmt: RegionalFormat }) {
  const c = scheduledProductionCopy;
  const defs = report.definitions;
  const columns: DataListColumn<ScheduledProductionProfessional>[] = [
    { id: 'professional', header: c.columns.professional, mobile: 'primary', cell: (r) => <span className="text-ink">{r.name}</span> },
    {
      id: 'scheduled',
      header: <HeaderWithHow label={c.columns.scheduled} definitions={defs} definition="SCHEDULED" />,
      numeric: true,
      mobile: 'trailing',
      cell: (r) => <span className="whitespace-nowrap tabular-nums">{amountText(r.scheduledAmount, report.currency, fmt)}</span>,
    },
    {
      id: 'appointments',
      header: c.columns.appointments,
      numeric: true,
      cell: (r) => <span className="tabular-nums">{fmt.number(r.appointments)}</span>,
      mobileCell: (r) => c.appointmentsMeta(r.appointments, fmt.number(r.appointments)),
    },
    {
      id: 'withoutItems',
      header: <HeaderWithHow label={c.columns.withoutItems} definitions={defs} definition="WITHOUT_ITEMS" />,
      numeric: true,
      cell: (r) => <span className="tabular-nums">{fmt.number(r.appointmentsWithoutItems)}</span>,
      mobileCell: (r) => (r.appointmentsWithoutItems > 0 ? c.withoutItemsMeta(fmt.number(r.appointmentsWithoutItems)) : null),
    },
  ];
  return (
    <section className="flex min-w-0 flex-col gap-2" aria-label={c.byProfessionalTitle}>
      <h3 className="t-label text-ink">{c.byProfessionalTitle}</h3>
      <DataList
        label={c.byProfessionalLabel}
        rows={report.byProfessional}
        columns={columns}
        getRowKey={(r) => r.professionalId}
      />
    </section>
  );
}

/**
 * La lista paginada de las citas que cuentan sin tratamiento ligado, con los
 * mismos filtros: cada una abre la cita en la agenda (`?cita=`) y el plan del
 * paciente. Lleva nombres de paciente: la API lo audita.
 */
function UnlinkedList({
  token,
  filters,
  total,
  fmt,
}: {
  token: string;
  filters: ScheduledProductionFilters;
  total: number;
  fmt: RegionalFormat;
}) {
  const c = scheduledProductionCopy;
  const filterKey = JSON.stringify(filters);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ScheduledProductionUnlinked | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    const query = JSON.parse(filterKey) as ScheduledProductionFilters;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await getScheduledProductionUnlinked(token, query, page, UNLINKED_PAGE_SIZE);
        if (cancelled) return;
        setData(res);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(apiErrorMessage(err, { fallback: c.unlinkedError }));
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, filterKey, page, reloadKey, c.unlinkedError]);

  const columns: DataListColumn<UnlinkedAppointment>[] = [
    {
      id: 'when',
      header: c.unlinkedColumns.when,
      mobile: 'primary',
      cell: (r) => (
        <span className="whitespace-nowrap tabular-nums text-ink">{fmt.dateTime(new Date(r.start), r.timeZone)}</span>
      ),
    },
    {
      id: 'patient',
      header: c.unlinkedColumns.patient,
      cell: (r) => (
        <Link
          href={treatmentPlanHref(r.patientId)}
          aria-label={c.openPlanFor(r.patientName)}
          className="inline-flex min-h-8 items-center font-medium text-primary-text underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-primary-text max-sm:min-h-11"
        >
          {r.patientName}
        </Link>
      ),
      mobileCell: (r) => r.patientName,
    },
    { id: 'type', header: c.unlinkedColumns.type, cell: (r) => r.appointmentTypeName ?? c.noValue, mobileCell: (r) => r.appointmentTypeName, showFrom: 'lg' },
    {
      id: 'professional',
      header: c.unlinkedColumns.professional,
      cell: (r) => r.professionalName ?? c.unattributed,
      mobileCell: (r) => r.professionalName,
    },
    { id: 'location', header: c.unlinkedColumns.location, cell: (r) => r.locationName, showFrom: 'md' },
    {
      id: 'open',
      header: c.unlinkedColumns.open,
      align: 'end',
      mobile: 'trailing',
      cell: (r) => (
        <Link
          href={appointmentHref(r.appointmentId)}
          aria-label={c.openAppointmentFor(r.patientName)}
          data-testid="scheduled-production-open-appointment"
          className="inline-flex min-h-8 items-center whitespace-nowrap font-medium text-primary-text underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-primary-text max-sm:min-h-11"
        >
          {c.openAppointment}
        </Link>
      ),
    },
  ];

  return (
    <section className="flex min-w-0 flex-col gap-2" aria-label={c.unlinkedTitle} data-testid="scheduled-production-unlinked">
      <h3 className="t-label text-ink">
        {c.unlinkedTitle} <span className="tabular-nums text-muted">({fmt.number(data?.total ?? total)})</span>
      </h3>
      <p className="t-caption max-w-[80ch] text-muted">{c.unlinkedCaption}</p>
      <AsyncSection
        loading={loading && !data}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        isEmpty={data?.items.length === 0}
        emptyTitle={c.empty}
        skeleton={<TableSkeleton rows={3} />}
      >
        {data ? (
          <div className="flex min-w-0 flex-col gap-3">
            <DataList label={c.unlinkedLabel} rows={data.items} columns={columns} getRowKey={(r) => r.appointmentId} />
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} disabled={loading} />
          </div>
        ) : null}
      </AsyncSection>
    </section>
  );
}

function ViewSkeleton() {
  return (
    <div role="status" aria-label={scheduledProductionCopy.loading} className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-4 sm:p-6">
        <Skeleton className="h-3 w-40" />
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </Card>
      <TableSkeleton rows={4} />
    </div>
  );
}

/**
 * «Previsión» (DX-567), pestaña de Reportes: la previsión del mes en curso
 * (producido hasta hoy + agendado pendiente), lo agendado del período por día
 * y por profesional y las citas que no suman por no tener tratamiento ligado.
 * Todo en la moneda del catálogo (la API convierte con la tasa guardada del
 * día). Un odontólogo ve solo lo suyo (`scope: 'OWN'`, sin filtro de
 * profesional). Período, sede y profesional viven en la URL (`?periodo=`,
 * `?desde=`, `?hasta=`, `?sede=`, `?profesional=`).
 */
export function ScheduledProductionView({
  token,
  ownByRole = false,
}: {
  token: string;
  /** DENTIST sin FINANCIAL_REPORTS_VIEW: la API solo le da lo suyo, así que un
   *  `?profesional=` copiado de otra persona no se manda (daría 403). */
  ownByRole?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const zone = useSedeTimeZone(token);
  const timeZone = readyTimeZone(zone);
  const sedeFormat = useSedeFormat(token);
  const fmt = readyFormat(sedeFormat);
  const today = timeZone ? sedeToday(timeZone) : null;
  const ids = React.useId();
  const periodErrorId = `${ids}-period-error`;

  const presetParam = searchParams.get('periodo');
  const preset: ScheduledPresetKey = isScheduledPreset(presetParam) ? presetParam : 'this_month';
  const fromParam = searchParams.get('desde');
  const toParam = searchParams.get('hasta');
  const locationId = searchParams.get('sede') ?? '';
  const providerParam = searchParams.get('profesional') ?? '';
  const customPeriod =
    isCivilDate(fromParam) && isCivilDate(toParam)
      ? { from: fromParam, to: toParam }
      : today
        ? scheduledPeriodFor('this_month', today)
        : null;
  const period = preset === 'custom' ? customPeriod : today ? scheduledPeriodFor(preset, today) : null;
  const invalidPeriod = preset === 'custom' && period !== null && !isValidScheduledPeriod(period);

  const [data, setData] = useState<ScheduledProductionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [zoneError, setZoneError] = useState<{ message: string; locationId: string | null } | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Con scope OWN la API ya acota a quien consulta: el filtro no se ve ni se manda.
  const own = data?.scope === 'OWN' || ownByRole;
  const providerId = own ? '' : providerParam;
  const filters: ScheduledProductionFilters | null =
    period && !invalidPeriod
      ? { ...period, ...(locationId ? { locationId } : {}), ...(providerId ? { providerId } : {}) }
      : null;
  const filterKey = filters ? JSON.stringify(filters) : null;

  useEffect(() => {
    if (!token || !filterKey) return;
    const query = JSON.parse(filterKey) as ScheduledProductionFilters;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await getScheduledProduction(token, query);
        if (cancelled) return;
        setData(res);
        setLoadError(null);
        setZoneError(null);
        setForbidden(false);
      } catch (err) {
        if (cancelled) return;
        // Un 403 sin filtros es el rol; con sede o profesional, ese filtro (se ve el mensaje).
        setForbidden(err instanceof ApiError && err.status === 403 && !query.locationId && !query.providerId);
        const message = apiErrorMessage(err, {
          fallback: scheduledProductionCopy.loadError,
          byStatus: { 400: scheduledProductionCopy.badRequest },
        });
        if (err instanceof ApiError && err.code === LOCATION_TIMEZONE_REQUIRED) {
          setZoneError({ message, locationId: err.locationId });
          setLoadError(null);
        } else {
          setZoneError(null);
          setLoadError(message);
        }
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, filterKey, reloadKey]);

  /** Reescribe filtros en la URL sin navegar (conserva `?tab=`). */
  function setParams(values: Partial<Record<'periodo' | 'desde' | 'hasta' | 'sede' | 'profesional', string>>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(values)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function choosePreset(next: ScheduledPresetKey) {
    // Al pasar a «Personalizado» se parte de las fechas que se veían.
    if (next === 'custom' && period) setParams({ periodo: next, desde: period.from, hasta: period.to });
    else setParams({ periodo: next === 'this_month' ? '' : next, desde: '', hasta: '' });
  }

  const c = scheduledProductionCopy;
  if (forbidden) {
    return <EmptyState role="status" icon={<Lock aria-hidden />} title={c.forbiddenTitle} description={c.forbiddenHint} />;
  }

  const showLoading = !invalidPeriod && (loading || !filters);
  const ready = Boolean(data && fmt && !invalidPeriod && !showLoading && !loadError && !zoneError);
  const options = data?.options;
  const locationName = locationId ? options?.locations.find((l) => l.id === locationId)?.name : null;
  const scopeParts = [
    own ? c.scopeOwn : c.scopeClinic,
    locationName ? c.scopeLocation(locationName) : locationId ? null : c.scopeAllLocations,
  ].filter(Boolean);
  const scopeText = `${scopeParts.join(' · ')}${data?.currency ? ` · ${c.scopeCurrency(data.currency)}` : ''}`;
  const definitions = data?.definitions ?? [];
  const warnings = data?.warnings ?? [];

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p data-testid="scheduled-production-scope" className="t-caption inline-flex items-center gap-1.5 text-muted">
        {own ? <UserRound aria-hidden className="size-4 shrink-0" /> : <Building2 aria-hidden className="size-4 shrink-0" />}
        <span>{scopeText}</span>
      </p>

      <div className="grid min-w-0 grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-end">
        <FormField htmlFor={`${ids}-period`} label={c.period} className="sm:w-48">
          <NativeSelect id={`${ids}-period`} value={preset} onChange={(e) => choosePreset(e.target.value as ScheduledPresetKey)}>
            {SCHEDULED_PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        {preset === 'custom' && period ? (
          <FormField htmlFor={`${ids}-dates`} label={c.dates} className="sm:w-72">
            <DateRangePicker
              id={`${ids}-dates`}
              value={period}
              onChange={(range) => {
                if (range) setParams({ periodo: 'custom', desde: range.from, hasta: range.to });
              }}
              startLabel={c.from}
              endLabel={c.to}
              isInvalid={invalidPeriod}
              aria-describedby={invalidPeriod ? periodErrorId : undefined}
            />
          </FormField>
        ) : null}
        <FormField htmlFor={`${ids}-location`} label={c.location} className="min-w-0 sm:w-52">
          <NativeSelect id={`${ids}-location`} value={locationId} onChange={(e) => setParams({ sede: e.target.value })} disabled={!options}>
            <option value="">{c.locationAll}</option>
            {options?.locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.isActive ? l.name : `${l.name} ${c.inactive}`}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        {own ? null : (
          <FormField htmlFor={`${ids}-professional`} label={c.professional} className="min-w-0 sm:w-56">
            <NativeSelect
              id={`${ids}-professional`}
              value={providerParam}
              onChange={(e) => setParams({ profesional: e.target.value })}
              disabled={!options}
            >
              <option value="">{c.professionalAll}</option>
              {options?.professionals.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.fullName}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        )}
      </div>

      {invalidPeriod ? <InlineError id={periodErrorId}>{c.badRequest}</InlineError> : null}

      {ready && data?.restrictedToLocations ? (
        <Callout tone="info" role="note" data-testid="scheduled-production-restricted" className="max-w-[80ch] self-start py-2">
          {c.restricted}
        </Callout>
      ) : null}
      {ready && warnings.includes('NO_CATALOG_CURRENCY') ? (
        <Callout tone="warning" data-testid="scheduled-production-no-currency" className="max-w-[80ch] self-start py-2">
          {c.noCatalogCurrency}
        </Callout>
      ) : null}
      {ready && data && warnings.includes('WITHOUT_RATE') && data.withoutRate.appointments > 0 ? (
        <Callout tone="warning" data-testid="scheduled-production-without-rate" className="max-w-[80ch] self-start py-2">
          {c.withoutRate(data.withoutRate.appointments)}
        </Callout>
      ) : null}
      {ready && data && warnings.includes('WITHOUT_RATE') && data.forecast.itemsWithoutRate > 0 ? (
        <Callout tone="warning" data-testid="scheduled-production-forecast-without-rate" className="max-w-[80ch] self-start py-2">
          {c.forecastWithoutRate(data.forecast.itemsWithoutRate)}
        </Callout>
      ) : null}
      {ready && warnings.includes('MIXED_MONTHS') ? (
        <Callout tone="info" role="note" data-testid="scheduled-production-mixed-months" className="max-w-[80ch] self-start py-2">
          {c.mixedMonths}
        </Callout>
      ) : null}
      {ready && data && warnings.includes('UNATTRIBUTED_DONE') && data.unattributedDone > 0 ? (
        <Callout tone="info" role="note" data-testid="scheduled-production-unattributed" className="max-w-[80ch] self-start py-2">
          {c.unattributedDone(data.unattributedDone)}
        </Callout>
      ) : null}

      {invalidPeriod ? null : zoneError ? (
        <SedeConfigError
          kind="timeZone"
          description={zoneError.message}
          locationId={zoneError.locationId}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      ) : zone.status === 'error' && !period ? (
        <SedeConfigError kind="timeZone" description={zone.message} onRetry={zone.retry} />
      ) : sedeFormat.status === 'error' ? (
        <SedeConfigError kind="locale" description={sedeFormat.message} onRetry={sedeFormat.retry} locationId={sedeFormat.locationId} />
      ) : (
        <AsyncSection
          loading={showLoading || sedeFormat.status === 'loading'}
          error={loadError}
          onRetry={() => setReloadKey((k) => k + 1)}
          skeleton={<ViewSkeleton />}
        >
          {data && fmt && filters ? (
            <div className="flex min-w-0 flex-col gap-6">
              <ForecastCard report={data} fmt={fmt} />
              <div className="flex min-w-0 flex-col gap-3">
                <p className="text-sm text-muted tabular-nums">
                  {c.periodLine(fmt.civilDate(data.period.from), fmt.civilDate(data.period.to))}
                </p>
                {data.totals.appointments === 0 ? (
                  <EmptyState icon={<CalendarDays aria-hidden />} title={c.empty} description={c.emptyHint} />
                ) : (
                  <div className="flex min-w-0 flex-col gap-6">
                    <PeriodTotals report={data} fmt={fmt} />
                    <div className="grid min-w-0 gap-6 lg:grid-cols-2 lg:items-start">
                      <ByDayList report={data} fmt={fmt} />
                      {data.byProfessional.length > 0 ? <ByProfessionalList report={data} fmt={fmt} /> : null}
                    </div>
                    {data.totals.appointmentsWithoutItems > 0 ? (
                      <UnlinkedList
                        // Otros filtros: la lista vuelve a su primera página.
                        key={JSON.stringify(filters)}
                        token={token}
                        filters={filters} total={data.totals.appointmentsWithoutItems} fmt={fmt} />
                    ) : null}
                  </div>
                )}
              </div>
              {definitions.length > 0 ? (
                <div className="-mx-2 max-w-[80ch] self-start" data-testid="scheduled-production-how">
                  <Disclosure summary={c.howTitle}>
                    <dl className="flex flex-col gap-3 px-2 text-sm">
                      {definitions.map((d) => (
                        <div key={d.key} className="flex flex-col gap-1">
                          <dt className="font-medium text-ink">{d.label}</dt>
                          <dd>
                            <ul className="flex list-disc flex-col gap-1 pl-5 text-muted">
                              {d.howItIsCalculated.map((line) => (
                                <li key={line}>{line}</li>
                              ))}
                            </ul>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </Disclosure>
                </div>
              ) : null}
            </div>
          ) : null}
        </AsyncSection>
      )}
    </div>
  );
}
