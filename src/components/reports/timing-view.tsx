'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Building2, Download, Lock, Timer } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { readyTimeZone, sedeToday, useSedeTimeZone } from '@/lib/locations/use-sede-time-zone';
import { readyFormat, useSedeFormat } from '@/lib/locations/use-sede-format';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { saveCsv } from '@/lib/files/save-csv';
import { isWithinMonths, PERIOD_PRESETS, periodFor, type PeriodPresetKey } from '@/lib/reports/period-presets';
import { isCivilDate } from '@/lib/reports/chair-occupancy-api';
import {
  definitionOf,
  downloadTimingCsv,
  excludedCount,
  formatHours,
  formatMinutes,
  formatOccupancy,
  formatSignedPercent,
  getTimingReport,
  incoherentText,
  NO_VALUE,
  TIMING_MAX_PERIOD_MONTHS,
  weekLabel,
  withoutTimesText,
  type TimingDefinition,
  type TimingDefinitionKey,
  type TimingFigures,
  type TimingFilters,
  type TimingOccupancyRow,
  type TimingOccupancyWeek,
  type TimingProfessionalRow,
  type TimingReport,
  type TimingTypeRow,
  type TimingWeekRow,
} from '@/lib/reports/timing-api';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { notifyError } from '@/components/errors/notify';
import { InlineError } from '@/components/errors/inline-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { DateRangePicker } from '@/components/ui/date-picker';
import { NativeSelect } from '@/components/ui/native-select';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { FormField } from '@/components/shared/form-field';
import { HowCalculated } from './how-calculated';
import { Stat, StatGroup } from './stat-group';

const LOCATION_TIMEZONE_REQUIRED = 'LOCATION_TIMEZONE_REQUIRED';
const DEFAULT_PRESET: PeriodPresetKey = 'last_30_days';

export const timingCopy = {
  scopeClinic: 'Citas atendidas de tus sedes',
  scopeLocation: (name: string) => `Citas atendidas de la sede ${name}`,
  scopeProfessional: (name: string) => `de ${name}`,
  scopeOwn: 'Solo lo tuyo: las citas que atendiste',
  period: 'Período',
  dates: 'Fechas',
  from: 'Desde',
  to: 'Hasta',
  location: 'Sede',
  locationAll: 'Todas tus sedes',
  professional: 'Profesional',
  professionalAll: 'Todo el equipo',
  inactive: '(desactivada)',
  export: 'Descargar CSV',
  exporting: 'Descargando…',
  exported: 'Informe descargado.',
  exportError: 'No pudimos descargar el informe de tiempos.',
  periodLine: (from: string, to: string) => `Del ${from} al ${to} · horas en la zona horaria de cada sede`,
  summaryTitle: 'En el período',
  measured: (n: string) => `${n} con tiempos válidos`,
  p90: (text: string) => `p90 ${text}`,
  plannedHint: 'Media de las citas medidas',
  occupancyHint: (attended: string, available: string) => `${attended} atendidas de ${available} disponibles`,
  occupancyNoSchedule: (attended: string) => `${attended} atendidas · sin horario en el período`,
  excludedBody:
    'No entran en las medias ni en el p90: les falta alguna hora del panel «En clínica» o sus horas no cuadran.',
  overrunTitle: (n: number) =>
    n === 1 ? '1 tipo de cita dura más de lo agendado' : `${n} tipos de cita duran más de lo agendado`,
  overrunItem: (name: string, percent: string, measured: string) =>
    `${name}: ${percent} sobre lo agendado (${measured} citas medidas)`,
  overrunHint: 'Revisa su duración en el catálogo de tipos de cita.',
  exceeds: 'Se excede',
  catalog: 'En el catálogo',
  meanAndP90: 'media · p90',
  professionalsTitle: 'Por profesional',
  professionalsLabel: 'Tiempos por profesional',
  typesTitle: 'Por tipo de cita',
  typesLabel: 'Tiempos por tipo de cita',
  weeksTitle: 'Por semana',
  weeksLabel: 'Tiempos por semana',
  weeksCaption: 'Semanas de lunes a domingo; la primera y la última pueden quedar recortadas al período.',
  occupancyTitle: 'Ocupación por profesional',
  occupancyLabel: 'Horas y ocupación por profesional',
  occupancyCaption:
    'Horas de su horario en la sede, menos festivos, bloqueos y cierres; puede pasar del 100 % si se atiende fuera de horario.',
  occupancyWeeksSummary: (name: string) => `${name} · por semana`,
  occupancyWeeksLabel: (name: string) => `Ocupación de ${name} por semana`,
  occupancyTotal: 'Todo el equipo',
  noSchedule: 'Sin horario',
  definitionsTitle: 'Cómo se calcula cada cifra',
  columns: {
    professional: 'Profesional',
    type: 'Tipo de cita',
    week: 'Semana',
  },
  loadError: 'No pudimos cargar los tiempos de la agenda.',
  badRequest: 'El período no es válido: «Desde» no puede ser posterior a «Hasta» y caben como mucho 12 meses.',
  forbiddenTitle: 'Tu rol no tiene acceso a los tiempos de la agenda.',
  forbiddenHint: 'Los ven la administración y los odontólogos (cada uno, los suyos).',
  empty: 'Sin datos en el período',
  emptyHint: 'No hay citas atendidas ni horario con estos filtros. Prueba con otro período, sede o profesional.',
};

type Param = 'periodo' | 'desde' | 'hasta' | 'sede' | 'profesional';
type TimeMetric = 'wait' | 'startDelay' | 'duration';

const isPreset = (value: string | null): value is PeriodPresetKey => PERIOD_PRESETS.some((p) => p.key === value);

const AVG: Record<TimeMetric, keyof TimingFigures> = {
  wait: 'waitAvgMinutes',
  startDelay: 'startDelayAvgMinutes',
  duration: 'durationAvgMinutes',
};
const P90: Record<TimeMetric, keyof TimingFigures> = {
  wait: 'waitP90Minutes',
  startDelay: 'startDelayP90Minutes',
  duration: 'durationP90Minutes',
};

const minutesOf = (figures: TimingFigures, key: keyof TimingFigures) => figures[key] as number | null;

/** Cabecera con la etiqueta de la API y su «Cómo se calcula». */
function Header({
  definition,
  fallback,
  sub,
}: {
  definition: TimingDefinition | undefined;
  fallback: string;
  sub?: string;
}) {
  const label = definition?.label ?? fallback;
  return (
    <span className="inline-flex flex-col items-end">
      <span className="inline-flex items-center justify-end gap-0.5">
        {label}
        {definition ? <HowCalculated column={label} text={definition.howItIsCalculated} /> : null}
      </span>
      {sub ? <span className="text-xs font-normal text-muted">{sub}</span> : null}
    </span>
  );
}

/** Media arriba y p90 debajo, en la misma celda. */
function MeanP90({ mean, p90 }: { mean: string; p90: string }) {
  return (
    <span className="inline-flex flex-col items-end whitespace-nowrap">
      <span>{mean}</span>
      <span className="text-xs text-muted">{timingCopy.p90(p90)}</span>
    </span>
  );
}

/** Las columnas de cifras que comparten las tablas por profesional, tipo y semana. */
function figureColumns<T extends TimingFigures>(report: TimingReport, fmt: RegionalFormat): DataListColumn<T>[] {
  const d = (key: TimingDefinitionKey) => definitionOf(report.definitions, key);
  const time = (metric: TimeMetric, fallback: string): DataListColumn<T> => ({
    id: metric,
    header: <Header definition={d(metric)} fallback={fallback} sub={timingCopy.meanAndP90} />,
    numeric: true,
    cell: (row) => (
      <MeanP90
        mean={formatMinutes(minutesOf(row, AVG[metric]), fmt)}
        p90={formatMinutes(minutesOf(row, P90[metric]), fmt)}
      />
    ),
  });
  return [
    {
      id: 'completed',
      header: <Header definition={d('completed')} fallback="Citas atendidas" />,
      numeric: true,
      cell: (row) => fmt.number(row.completed),
    },
    time('wait', 'Espera en sala'),
    time('startDelay', 'Retraso de inicio'),
    time('duration', 'Duración real'),
    {
      id: 'planned',
      header: <Header definition={d('planned')} fallback="Duración programada" />,
      numeric: true,
      cell: (row) => <span className="whitespace-nowrap">{formatMinutes(row.plannedAvgMinutes, fmt)}</span>,
    },
    {
      id: 'durationVsPlanned',
      header: <Header definition={d('durationVsPlanned')} fallback="Real frente a programada" />,
      numeric: true,
      cell: (row) => (
        <span className="whitespace-nowrap">{formatSignedPercent(row.durationVsPlannedPercent, fmt)}</span>
      ),
    },
    {
      id: 'withoutTimes',
      header: <Header definition={d('withoutTimes')} fallback="Citas sin tiempos" />,
      numeric: true,
      cell: (row) => fmt.number(row.withoutTimes),
    },
    {
      id: 'incoherent',
      header: <Header definition={d('incoherent')} fallback="Citas con tiempos incoherentes" />,
      numeric: true,
      cell: (row) => fmt.number(row.incoherent),
    },
  ];
}

function TableSection({
  title,
  caption,
  children,
  testId,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2" aria-label={title} data-testid={testId}>
      <div className="flex flex-col gap-0.5">
        <h2 className="t-label text-ink">{title}</h2>
        {caption ? <p className="t-caption max-w-[80ch]">{caption}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Summary({ report, fmt }: { report: TimingReport; fmt: RegionalFormat }) {
  const c = timingCopy;
  const t = report.totals;
  const how = (key: TimingDefinitionKey, label: string) => {
    const def = definitionOf(report.definitions, key);
    return (
      <span className="inline-flex items-center gap-1">
        <span>{label}</span>
        {def ? <HowCalculated column={def.label} text={def.howItIsCalculated} /> : null}
      </span>
    );
  };
  const label = (key: TimingDefinitionKey, fallback: string) =>
    definitionOf(report.definitions, key)?.label ?? fallback;
  const occ = report.occupancy.totals;
  return (
    <StatGroup as="h2" title={c.summaryTitle} className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
      <Stat
        testId="timing-total-completed"
        label={label('completed', 'Citas atendidas')}
        value={how('completed', fmt.number(t.completed))}
        hint={c.measured(fmt.number(t.measured))}
      />
      {(
        [
          ['wait', 'Espera en sala'],
          ['startDelay', 'Retraso de inicio'],
          ['duration', 'Duración real'],
        ] as const
      ).map(([metric, fallback]) => (
        <Stat
          key={metric}
          testId={`timing-total-${metric}`}
          label={label(metric, fallback)}
          value={how(metric, formatMinutes(minutesOf(t, AVG[metric]), fmt))}
          hint={c.p90(formatMinutes(minutesOf(t, P90[metric]), fmt))}
        />
      ))}
      <Stat
        testId="timing-total-durationVsPlanned"
        label={label('durationVsPlanned', 'Real frente a programada')}
        value={how('durationVsPlanned', formatSignedPercent(t.durationVsPlannedPercent, fmt))}
        hint={`${label('planned', 'Duración programada')}: ${formatMinutes(t.plannedAvgMinutes, fmt)}`}
      />
      <Stat
        testId="timing-total-occupancy"
        label={label('occupancy', 'Ocupación')}
        value={how('occupancy', formatOccupancy(occ.occupancyPercent, fmt))}
        hint={
          occ.occupancyPercent === null
            ? c.occupancyNoSchedule(formatHours(occ.attendedMinutes, fmt))
            : c.occupancyHint(formatHours(occ.attendedMinutes, fmt), formatHours(occ.availableMinutes, fmt))
        }
      />
    </StatGroup>
  );
}

/** «X citas sin tiempos» (+ las incoherentes): se excluyen y se cuentan aparte. */
function ExcludedNotice({ report, fmt }: { report: TimingReport; fmt: RegionalFormat }) {
  const { withoutTimes, incoherent } = report.totals;
  if (excludedCount(report.totals) === 0) return null;
  const parts = [
    withoutTimes > 0 ? withoutTimesText(withoutTimes, fmt) : null,
    incoherent > 0 ? incoherentText(incoherent, fmt) : null,
  ].filter(Boolean);
  return (
    <Callout tone="warning" data-testid="timing-excluded" title={parts.join(' · ')} className="max-w-[80ch]">
      {timingCopy.excludedBody}
    </Callout>
  );
}

function OverrunNotice({ report, fmt }: { report: TimingReport; fmt: RegionalFormat }) {
  const over = report.byAppointmentType.filter((r) => r.exceedsPlanned);
  if (over.length === 0) return null;
  const c = timingCopy;
  const def = definitionOf(report.definitions, 'typeOverrun');
  return (
    <Callout tone="warning" data-testid="timing-overrun" title={c.overrunTitle(over.length)} className="max-w-[80ch]">
      <ul className="flex flex-col gap-0.5">
        {over.map((r) => (
          <li key={r.appointmentTypeId ?? 'none'} className="tabular-nums">
            {c.overrunItem(
              r.appointmentTypeName,
              formatSignedPercent(r.durationVsPlannedPercent, fmt),
              fmt.number(r.measured),
            )}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs">{def ? `${def.howItIsCalculated} ${c.overrunHint}` : c.overrunHint}</p>
    </Callout>
  );
}

function ByProfessional({ report, fmt }: { report: TimingReport; fmt: RegionalFormat }) {
  const c = timingCopy;
  if (report.byProfessional.length === 0) return null;
  const columns: DataListColumn<TimingProfessionalRow>[] = [
    { id: 'professional', header: c.columns.professional, cell: (r) => r.providerName },
    ...figureColumns<TimingProfessionalRow>(report, fmt),
  ];
  return (
    <TableSection title={c.professionalsTitle} testId="timing-by-professional">
      <DataList
        label={c.professionalsLabel}
        rows={report.byProfessional}
        columns={columns}
        getRowKey={(r) => r.providerId}
        phone="scroll"
      />
    </TableSection>
  );
}

function ByType({ report, fmt }: { report: TimingReport; fmt: RegionalFormat }) {
  const c = timingCopy;
  if (report.byAppointmentType.length === 0) return null;
  const columns: DataListColumn<TimingTypeRow>[] = [
    {
      id: 'type',
      header: c.columns.type,
      cell: (r) => (
        <span className="inline-flex flex-col items-start gap-1">
          <span>{r.appointmentTypeName}</span>
          {r.exceedsPlanned ? (
            <Badge variant="warning" data-testid="timing-type-exceeds">
              {c.exceeds}
            </Badge>
          ) : null}
        </span>
      ),
    },
    {
      id: 'catalog',
      header: c.catalog,
      numeric: true,
      cell: (r) => (
        <span className="whitespace-nowrap">
          {r.catalogDurationMinutes === null ? NO_VALUE : formatMinutes(r.catalogDurationMinutes, fmt)}
        </span>
      ),
    },
    ...figureColumns<TimingTypeRow>(report, fmt),
  ];
  return (
    <TableSection title={c.typesTitle} testId="timing-by-type">
      <DataList
        label={c.typesLabel}
        rows={report.byAppointmentType}
        columns={columns}
        getRowKey={(r) => r.appointmentTypeId ?? 'none'}
        phone="scroll"
      />
    </TableSection>
  );
}

function ByWeek({ report, fmt }: { report: TimingReport; fmt: RegionalFormat }) {
  const c = timingCopy;
  const columns: DataListColumn<TimingWeekRow>[] = [
    {
      id: 'week',
      header: c.columns.week,
      cell: (r) => <span className="whitespace-nowrap tabular-nums">{weekLabel(r, fmt)}</span>,
    },
    ...figureColumns<TimingWeekRow>(report, fmt),
  ];
  return (
    <TableSection title={c.weeksTitle} caption={c.weeksCaption} testId="timing-by-week">
      <DataList
        label={c.weeksLabel}
        rows={report.byWeek}
        columns={columns}
        getRowKey={(r) => r.weekStart}
        phone="scroll"
      />
    </TableSection>
  );
}

type OccupancyLike = Pick<
  TimingOccupancyWeek,
  'availableMinutes' | 'bookedMinutes' | 'attendedMinutes' | 'noShowMinutes' | 'freeMinutes' | 'occupancyPercent'
>;

function occupancyColumns<T extends OccupancyLike>(
  report: TimingReport,
  fmt: RegionalFormat,
  hasSchedule: (row: T) => boolean,
): DataListColumn<T>[] {
  const d = (key: TimingDefinitionKey) => definitionOf(report.definitions, key);
  const hours = (
    key: keyof OccupancyLike & TimingDefinitionKey,
    fallback: string,
    needsSchedule = false,
  ): DataListColumn<T> => ({
    id: key,
    header: <Header definition={d(key)} fallback={fallback} />,
    numeric: true,
    cell: (row) => (
      <span className="whitespace-nowrap">
        {needsSchedule && !hasSchedule(row) ? NO_VALUE : formatHours(row[key] as number, fmt)}
      </span>
    ),
  });
  return [
    hours('availableMinutes', 'Disponibles', true),
    hours('bookedMinutes', 'Citadas'),
    hours('attendedMinutes', 'Atendidas'),
    hours('noShowMinutes', 'No-show'),
    hours('freeMinutes', 'Libres', true),
    {
      id: 'occupancy',
      header: <Header definition={d('occupancy')} fallback="Ocupación" />,
      numeric: true,
      cell: (row) =>
        !hasSchedule(row) ? (
          <Badge variant="neutral">{timingCopy.noSchedule}</Badge>
        ) : (
          <span className="whitespace-nowrap font-semibold">{formatOccupancy(row.occupancyPercent, fmt)}</span>
        ),
    },
  ];
}

type OccupancyTableRow = OccupancyLike & { key: string; name: string; hasSchedule: boolean; total?: boolean };

function Occupancy({ report, fmt }: { report: TimingReport; fmt: RegionalFormat }) {
  const c = timingCopy;
  const pros = report.occupancy.professionals;
  if (pros.length === 0) return null;
  const rows: OccupancyTableRow[] = pros.map((p: TimingOccupancyRow) => ({
    ...p,
    key: p.providerId,
    name: p.providerName,
  }));
  if (pros.length > 1) {
    const t = report.occupancy.totals;
    rows.push({ ...t, key: 'total', name: c.occupancyTotal, hasSchedule: t.occupancyPercent !== null, total: true });
  }
  const columns: DataListColumn<OccupancyTableRow>[] = [
    {
      id: 'professional',
      header: c.columns.professional,
      cell: (r) => (r.total ? <span className="font-semibold">{r.name}</span> : r.name),
    },
    ...occupancyColumns<OccupancyTableRow>(report, fmt, (r) => r.hasSchedule),
  ];
  return (
    <TableSection title={c.occupancyTitle} caption={c.occupancyCaption} testId="timing-occupancy">
      <DataList label={c.occupancyLabel} rows={rows} columns={columns} getRowKey={(r) => r.key} phone="scroll" />
      <div className="flex min-w-0 flex-col gap-2">
        {pros.map((p) => (
          <OccupancyWeeks key={p.providerId} row={p} report={report} fmt={fmt} open={pros.length === 1} />
        ))}
      </div>
    </TableSection>
  );
}

/** Las semanas de un profesional, plegadas (con un solo profesional, abiertas). */
function OccupancyWeeks({
  row,
  report,
  fmt,
  open,
}: {
  row: TimingOccupancyRow;
  report: TimingReport;
  fmt: RegionalFormat;
  open: boolean;
}) {
  const c = timingCopy;
  const [expanded, setExpanded] = useState(open);
  const columns: DataListColumn<TimingOccupancyWeek>[] = [
    {
      id: 'week',
      header: c.columns.week,
      cell: (w) => <span className="whitespace-nowrap tabular-nums">{weekLabel(w, fmt)}</span>,
    },
    ...occupancyColumns<TimingOccupancyWeek>(report, fmt, () => row.hasSchedule),
  ];
  return (
    <details
      open={expanded}
      onToggle={(e) => setExpanded(e.currentTarget.open)}
      data-testid={`timing-occupancy-weeks-${row.providerId}`}
      className="group min-w-0 rounded-lg border border-border bg-surface"
    >
      <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text">
        {c.occupancyWeeksSummary(row.providerName)}
      </summary>
      {/* Solo abierta: lo plegado no se pinta y sus transiciones (tema) no acabarían nunca. */}
      {expanded ? (
        <div className="min-w-0 border-t border-border-subtle p-2">
          <DataList
            label={c.occupancyWeeksLabel(row.providerName)}
            rows={row.weeks}
            columns={columns}
            getRowKey={(w) => w.weekStart}
            phone="scroll"
          />
        </div>
      ) : null}
    </details>
  );
}

/** Las definiciones de la API, tal cual, con la nota común. */
function Definitions({ report }: { report: TimingReport }) {
  const c = timingCopy;
  return (
    <section className="flex min-w-0 flex-col gap-2" aria-label={c.definitionsTitle} data-testid="timing-definitions">
      <h2 className="t-label text-ink">{c.definitionsTitle}</h2>
      <p className="t-caption max-w-[80ch]">{report.scopeNote}</p>
      <dl className="grid min-w-0 gap-x-6 gap-y-3 sm:grid-cols-2">
        {report.definitions.map((d) => (
          <div key={d.key} className="min-w-0" data-testid={`timing-definition-${d.key}`}>
            <dt className="text-sm font-medium text-ink">{d.label}</dt>
            <dd className="text-sm break-words text-muted">{d.howItIsCalculated}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * «Tiempos» (DX-275), pestaña de Reportes: espera en sala, retraso de inicio y
 * duración real frente a la programada (media y p90), por profesional, por
 * tipo de cita (con el aviso de los que se exceden) y por semana, y la
 * ocupación por profesional y semana. Las citas sin tiempos o incoherentes se
 * cuentan aparte. Las definiciones las da la API y se enseñan tal cual.
 * Período (hasta 12 meses), sede y profesional en la URL (`?periodo=`,
 * `?desde=`, `?hasta=`, `?sede=`, `?profesional=`). El odontólogo
 * (`ownByRole`) ve lo suyo, sin selector de profesional. El CSV lo genera la
 * API (registra la exportación).
 */
export function TimingView({ token, ownByRole }: { token: string; ownByRole: boolean }) {
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
  const c = timingCopy;

  const presetParam = searchParams.get('periodo');
  const preset: PeriodPresetKey = isPreset(presetParam) ? presetParam : DEFAULT_PRESET;
  const fromParam = searchParams.get('desde');
  const toParam = searchParams.get('hasta');
  const locationId = searchParams.get('sede') ?? '';
  const providerId = ownByRole ? '' : (searchParams.get('profesional') ?? '');
  const customPeriod =
    isCivilDate(fromParam) && isCivilDate(toParam)
      ? { from: fromParam, to: toParam }
      : today
        ? periodFor(DEFAULT_PRESET, today)
        : null;
  const period = preset === 'custom' ? customPeriod : today ? periodFor(preset, today) : null;
  const invalidPeriod = preset === 'custom' && period !== null && !isWithinMonths(period, TIMING_MAX_PERIOD_MONTHS);

  const [data, setData] = useState<TimingReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [zoneError, setZoneError] = useState<{ message: string; locationId: string | null } | null>(null);
  const [forbidden, setForbidden] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const filters: TimingFilters | null =
    period && !invalidPeriod
      ? { ...period, ...(locationId ? { locationId } : {}), ...(providerId ? { providerId } : {}) }
      : null;
  const filterKey = filters ? JSON.stringify(filters) : null;

  useEffect(() => {
    if (!token || !filterKey) return;
    const query = JSON.parse(filterKey) as TimingFilters;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await getTimingReport(token, query);
        if (cancelled) return;
        setData(res);
        setLoadError(null);
        setZoneError(null);
        setForbidden(null);
      } catch (err) {
        if (cancelled) return;
        const message = apiErrorMessage(err, { fallback: c.loadError, byStatus: { 400: c.badRequest } });
        // Sin sede ni profesional, un 403 es del rol (recepción, asistente): estado de sin acceso.
        const byRole = err instanceof ApiError && err.status === 403 && !query.locationId && !query.providerId;
        setForbidden(byRole ? message : null);
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
  }, [token, filterKey, reloadKey, c.loadError, c.badRequest]);

  /** Reescribe filtros en la URL sin navegar (conserva `?tab=`). */
  function setParams(values: Partial<Record<Param, string>>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(values)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function choosePreset(next: PeriodPresetKey) {
    if (next === 'custom' && period) setParams({ periodo: next, desde: period.from, hasta: period.to });
    else setParams({ periodo: next === DEFAULT_PRESET ? '' : next, desde: '', hasta: '' });
  }

  async function exportCsv() {
    if (!filterKey) return;
    setExporting(true);
    setNotice(null);
    try {
      const query = JSON.parse(filterKey) as TimingFilters;
      const text = await downloadTimingCsv(token, query);
      saveCsv(text, `tiempos-de-agenda-${query.from}-${query.to}.csv`, { bom: true });
      setNotice(c.exported);
    } catch (err) {
      notifyError(apiErrorMessage(err, { fallback: c.exportError }), { onRetry: () => void exportCsv() });
    } finally {
      setExporting(false);
    }
  }

  if (forbidden !== null) {
    return (
      <div data-testid="timing-forbidden">
        <EmptyState
          role="status"
          icon={<Lock aria-hidden />}
          title={c.forbiddenTitle}
          description={forbidden || c.forbiddenHint}
        />
      </div>
    );
  }

  const showLoading = !invalidPeriod && (loading || !filters) && !data;
  const refreshing = loading && Boolean(data);
  const ready = Boolean(data && fmt && !invalidPeriod && !showLoading && !loadError && !zoneError);
  const options = data?.options;
  const locationName = locationId ? options?.locations.find((l) => l.id === locationId)?.name : null;
  const providerName = providerId ? options?.professionals.find((p) => p.userId === providerId)?.fullName : null;
  const scopeText = ownByRole
    ? [c.scopeOwn, locationName ? `· ${locationName}` : null].filter(Boolean).join(' ')
    : [
        locationName ? c.scopeLocation(locationName) : c.scopeClinic,
        providerName ? c.scopeProfessional(providerName) : null,
      ]
        .filter(Boolean)
        .join(' ');

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p data-testid="timing-scope" className="t-caption inline-flex items-center gap-1.5 text-muted">
        <Building2 aria-hidden className="size-4 shrink-0" />
        <span>{scopeText}</span>
      </p>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-4">
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-end">
          <FormField htmlFor={`${ids}-period`} label={c.period} className="sm:w-44">
            <NativeSelect
              id={`${ids}-period`}
              value={preset}
              onChange={(e) => choosePreset(e.target.value as PeriodPresetKey)}
            >
              {PERIOD_PRESETS.map((p) => (
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
            <NativeSelect
              id={`${ids}-location`}
              value={locationId}
              onChange={(e) => setParams({ sede: e.target.value })}
              disabled={!options}
            >
              <option value="">{c.locationAll}</option>
              {options?.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.isActive ? l.name : `${l.name} ${c.inactive}`}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          {ownByRole ? null : (
            <FormField htmlFor={`${ids}-professional`} label={c.professional} className="min-w-0 sm:w-52">
              <NativeSelect
                id={`${ids}-professional`}
                value={providerId}
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
        <Button
          type="button"
          variant="secondary"
          onClick={() => void exportCsv()}
          disabled={exporting || showLoading || invalidPeriod || Boolean(loadError) || Boolean(zoneError)}
          className="shrink-0 self-start max-sm:min-h-11 lg:self-auto"
          data-testid="timing-export"
        >
          <Download aria-hidden />
          {exporting ? c.exporting : c.export}
        </Button>
      </div>

      <p role="status" className={notice ? 'text-sm text-success-text' : 'sr-only'}>
        {notice}
      </p>

      {invalidPeriod ? <InlineError id={periodErrorId}>{c.badRequest}</InlineError> : null}

      {ready && data && fmt ? (
        <p className="text-sm text-muted tabular-nums">
          {c.periodLine(fmt.civilDate(data.from), fmt.civilDate(data.to))}
        </p>
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
        <SedeConfigError
          kind="locale"
          description={sedeFormat.message}
          onRetry={sedeFormat.retry}
          locationId={sedeFormat.locationId}
        />
      ) : (
        <AsyncSection
          loading={showLoading || sedeFormat.status === 'loading'}
          error={loadError}
          onRetry={() => setReloadKey((k) => k + 1)}
          isEmpty={!data || !data.hasData}
          emptyTitle={c.empty}
          emptyDescription={c.emptyHint}
          emptyIcon={<Timer aria-hidden />}
          skeleton={<TableSkeleton rows={4} />}
        >
          {data && fmt ? (
            <div className="flex min-w-0 flex-col gap-6" aria-busy={refreshing}>
              <Summary report={data} fmt={fmt} />
              <ExcludedNotice report={data} fmt={fmt} />
              <ByProfessional report={data} fmt={fmt} />
              <OverrunNotice report={data} fmt={fmt} />
              <ByType report={data} fmt={fmt} />
              <ByWeek report={data} fmt={fmt} />
              <Occupancy report={data} fmt={fmt} />
              <Definitions report={data} />
            </div>
          ) : null}
        </AsyncSection>
      )}
    </div>
  );
}
