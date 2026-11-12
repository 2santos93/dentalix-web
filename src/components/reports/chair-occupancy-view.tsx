'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Armchair, Download, Lock } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { readyTimeZone, sedeToday, useSedeTimeZone } from '@/lib/locations/use-sede-time-zone';
import { readyFormat, useSedeFormat } from '@/lib/locations/use-sede-format';
import { useSessionLocations } from '@/lib/session/session-store';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { saveCsv } from '@/lib/files/save-csv';
import { isValidPeriod } from '@/lib/reports/period-presets';
import { formatDurationMinutes } from '@/lib/reports/recovered-slots-api';
import {
  downloadChairOccupancyCsv,
  getChairOccupancy,
  isCivilDate,
  isOccupancyPreset,
  locationHasRows,
  OCCUPANCY_PRESETS,
  occupancyPeriodFor,
  type ChairOccupancyFilters,
  type ChairOccupancyMetrics,
  type ChairOccupancyReport,
  type LocationChairOccupancy,
  type OccupancyPresetKey,
} from '@/lib/reports/chair-occupancy-api';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { notifyError } from '@/components/errors/notify';
import { InlineError } from '@/components/errors/inline-error';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { DateRangePicker } from '@/components/ui/date-picker';
import { NativeSelect } from '@/components/ui/native-select';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { Disclosure } from '@/components/shared/disclosure';
import { EmptyState } from '@/components/shared/empty-state';
import { FormField } from '@/components/shared/form-field';
import { cn } from '@/lib/utils';

export const occupancyCopy = {
  scope: 'Cuánto tiempo abierto de cada sillón estuvo reservado y cuánto se atendió, por sede',
  period: 'Período',
  dates: 'Fechas',
  from: 'Desde',
  to: 'Hasta',
  location: 'Sede',
  locationAll: 'Todas tus sedes',
  inactive: '(desactivada)',
  export: 'Descargar CSV',
  exporting: 'Descargando…',
  exported: 'Informe descargado.',
  exportError: 'No pudimos descargar el informe.',
  restricted: 'Solo incluye tus sedes.',
  periodLine: (from: string, to: string) => (from === to ? `Citas del ${from}` : `Citas del ${from} al ${to}`),
  noValue: '—',
  howTitle: 'Cómo se calcula',
  howFormula: 'Ocupación = reservados ÷ abiertos.',
  howItems: [
    'Abiertos: el horario semanal de la sede en el período, menos los cierres de toda la sede y los festivos. Un sillón está abierto cuando la sede lo está.',
    'Reservados: los minutos de las citas no canceladas dentro del horario, inasistencias incluidas. Dos citas que se pisan en el mismo sillón cuentan una vez.',
    'Atendidos: lo mismo, solo con las citas atendidas. Las inasistencias reservan el sillón pero no se atienden: van en su propia columna.',
    'Ningún porcentaje pasa del 100 %. Las citas sin sillón van en «Sin sillón», sin porcentaje, y no entran en el total de la sede.',
  ],
  locationSummary: (open: string, chairs: number) =>
    `${open} abiertos por sillón · ${chairs === 1 ? '1 sillón' : `${chairs} sillones`}`,
  holidays: (n: number) => (n === 1 ? '1 día festivo' : `${n} días festivos`),
  noSchedule: 'Sin horario: la sede no tiene horario semanal, así que no hay minutos abiertos ni porcentajes. Configúralo en Ajustes → Sedes.',
  noChairs: 'Esta sede no tiene sillones.',
  tableLabel: (location: string) => `Ocupación por sillón de ${location}`,
  noChairRow: 'Sin sillón',
  totalRow: 'Total de la sede',
  chairInactive: (name: string) => `${name} (desactivado)`,
  columns: {
    chair: 'Sillón',
    open: 'Abiertos',
    reserved: 'Reservados',
    occupancy: 'Ocupación',
    attended: 'Atendidos',
    attendedRate: '% atendido',
    noShow: 'Inasistencias',
  },
  noShowCell: (minutes: string, count: number) => `${count} · ${minutes}`,
  mobileOpen: (v: string) => `Abiertos ${v}`,
  mobileReserved: (v: string) => `Reservados ${v}`,
  mobileAttended: (v: string, rate: string) => `Atendidos ${v} (${rate})`,
  mobileAttendedPlain: (v: string) => `Atendidos ${v}`,
  mobileNoShow: (count: number, minutes: string) =>
    count === 1 ? `1 inasistencia (${minutes})` : `${count} inasistencias (${minutes})`,
  loadError: 'No pudimos cargar la ocupación por sillón.',
  badRequest: 'El período no es válido: elige fechas de hasta 366 días con «Desde» anterior o igual a «Hasta».',
  forbiddenTitle: 'Tu rol no tiene acceso a la ocupación por sillón.',
  forbiddenHint: 'Es para la administración de la clínica.',
  empty: 'Sin sillones ni citas',
  emptyHint: 'Ninguna sede tiene sillones ni citas en este período. Crea los sillones en Ajustes → Sedes o prueba con otro período o sede.',
};

type Row =
  | ({ kind: 'chair'; key: string; label: string } & ChairOccupancyMetrics)
  | ({ kind: 'noChair'; key: string; label: string } & ChairOccupancyMetrics)
  | ({ kind: 'total'; key: string; label: string } & ChairOccupancyMetrics);

/** Una fracción 0–1 como porcentaje de la sede, o «—» sin base. */
function rateText(rate: number | null, fmt: RegionalFormat): string {
  return rate === null ? occupancyCopy.noValue : fmt.percent(rate * 100, 1);
}

function openText(minutes: number | null): string {
  return minutes === null ? occupancyCopy.noValue : formatDurationMinutes(minutes);
}

function rowsOf(location: LocationChairOccupancy): Row[] {
  const c = occupancyCopy;
  return [
    ...location.chairs.map((chair) => ({
      ...chair,
      kind: 'chair' as const,
      key: chair.chairId,
      label: chair.active ? chair.chairName : c.chairInactive(chair.chairName),
    })),
    ...(location.noChair ? [{ ...location.noChair, kind: 'noChair' as const, key: 'sin-sillon', label: c.noChairRow }] : []),
    ...(location.chairs.length > 0
      ? [{ ...location.totals, kind: 'total' as const, key: 'total', label: c.totalRow }]
      : []),
  ];
}

function columnsFor(fmt: RegionalFormat): DataListColumn<Row>[] {
  const c = occupancyCopy;
  return [
    {
      id: 'chair',
      header: c.columns.chair,
      mobile: 'primary',
      cell: (r) => (
        <span className={cn(r.kind === 'total' && 'font-semibold', r.kind === 'noChair' && 'text-muted')}>{r.label}</span>
      ),
      mobileCell: (r) => r.label,
    },
    {
      id: 'open',
      header: c.columns.open,
      numeric: true,
      cell: (r) => <span className="whitespace-nowrap">{openText(r.openMinutes)}</span>,
      mobileCell: (r) => (r.openMinutes === null ? null : c.mobileOpen(openText(r.openMinutes))),
    },
    {
      id: 'reserved',
      header: c.columns.reserved,
      numeric: true,
      cell: (r) => <span className="whitespace-nowrap">{formatDurationMinutes(r.reservedMinutes)}</span>,
      mobileCell: (r) => c.mobileReserved(formatDurationMinutes(r.reservedMinutes)),
    },
    {
      id: 'occupancy',
      header: c.columns.occupancy,
      numeric: true,
      mobile: 'trailing',
      cell: (r) => <span className={cn(r.kind === 'total' && 'font-semibold')}>{rateText(r.reservedRate, fmt)}</span>,
    },
    {
      id: 'attended',
      header: c.columns.attended,
      numeric: true,
      cell: (r) => <span className="whitespace-nowrap">{formatDurationMinutes(r.attendedMinutes)}</span>,
      mobileCell: (r) =>
        r.attendedRate === null
          ? c.mobileAttendedPlain(formatDurationMinutes(r.attendedMinutes))
          : c.mobileAttended(formatDurationMinutes(r.attendedMinutes), rateText(r.attendedRate, fmt)),
    },
    {
      id: 'attendedRate',
      header: c.columns.attendedRate,
      numeric: true,
      mobile: 'hidden',
      cell: (r) => rateText(r.attendedRate, fmt),
    },
    {
      id: 'noShow',
      header: c.columns.noShow,
      numeric: true,
      cell: (r) => (
        <span className="whitespace-nowrap">{c.noShowCell(formatDurationMinutes(r.noShowMinutes), r.noShowAppointments)}</span>
      ),
      mobileCell: (r) =>
        r.noShowAppointments === 0 ? null : c.mobileNoShow(r.noShowAppointments, formatDurationMinutes(r.noShowMinutes)),
    },
  ];
}

function LocationSection({ location, fmt }: { location: LocationChairOccupancy; fmt: RegionalFormat }) {
  const c = occupancyCopy;
  const headingId = React.useId();
  const summary = [
    location.openMinutesPerChair === null
      ? null
      : c.locationSummary(formatDurationMinutes(location.openMinutesPerChair), location.chairs.length),
    location.holidayDays > 0 ? c.holidays(location.holidayDays) : null,
  ].filter(Boolean);
  return (
    <section aria-labelledby={headingId} data-testid="occupancy-location" className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h3 id={headingId} className="t-label text-ink">
          {location.locationName}
        </h3>
        {summary.length > 0 ? <p className="text-sm text-muted tabular-nums">{summary.join(' · ')}</p> : null}
      </div>
      {location.hasSchedule ? null : (
        <Callout tone="info" role="note" data-testid="occupancy-no-schedule" className="max-w-[80ch] self-start py-2">
          {c.noSchedule}
        </Callout>
      )}
      {locationHasRows(location) ? (
        <DataList
          label={c.tableLabel(location.locationName)}
          rows={rowsOf(location)}
          columns={columnsFor(fmt)}
          getRowKey={(r) => r.key}
        />
      ) : (
        <p className="text-sm text-muted">{c.noChairs}</p>
      )}
    </section>
  );
}

function HowItIsCalculated() {
  const c = occupancyCopy;
  return (
    <div className="-mx-2 max-w-[80ch] self-start" data-testid="occupancy-how">
      <Disclosure summary={c.howTitle} meta={c.howFormula}>
        <div className="flex flex-col gap-2 text-sm text-muted">
          <p className="font-medium text-ink">{c.howFormula}</p>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {c.howItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </Disclosure>
    </div>
  );
}

/**
 * «Ocupación por sillón» (DX-481), pestaña de Reportes para la administración:
 * por sede y sillón, los minutos abiertos (horario de la sede − cierres −
 * festivos), reservados y atendidos, con las inasistencias aparte y las citas
 * sin sillón en su fila. Período (hoy / esta semana / este mes / mes anterior
 * / personalizado) y sede viven en la URL (`?periodo=`, `?desde=`, `?hasta=`,
 * `?sede=`) junto a la pestaña. A 390 px cada sillón es una tarjeta. El CSV,
 * solo ADMIN, con los mismos filtros.
 */
export function ChairOccupancyView({ token, isAdmin }: { token: string; isAdmin: boolean }) {
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
  const requestLocations = useSessionLocations(token);

  const presetParam = searchParams.get('periodo');
  const preset: OccupancyPresetKey = isOccupancyPreset(presetParam) ? presetParam : 'semana';
  const fromParam = searchParams.get('desde');
  const toParam = searchParams.get('hasta');
  const locationId = searchParams.get('sede') ?? '';
  const customPeriod =
    isCivilDate(fromParam) && isCivilDate(toParam)
      ? { from: fromParam, to: toParam }
      : today
        ? occupancyPeriodFor('semana', today)
        : null;
  const period = preset === 'personalizado' ? customPeriod : today ? occupancyPeriodFor(preset, today) : null;
  const invalidPeriod = preset === 'personalizado' && period !== null && !isValidPeriod(period);

  const [locations, setLocations] = useState<{ id: string; name: string; isActive: boolean }[] | null>(null);
  const [data, setData] = useState<ChairOccupancyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const filters: ChairOccupancyFilters | null =
    period && !invalidPeriod ? { ...period, ...(locationId ? { locationId } : {}) } : null;
  const filterKey = filters ? JSON.stringify(filters) : null;

  // Opciones de sede: si fallan, el filtro sigue con «Todas tus sedes».
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    requestLocations()
      .then((list) => {
        if (!cancelled) setLocations(list.map((l) => ({ id: l.id, name: l.name, isActive: l.isActive })));
      })
      .catch(() => {
        if (!cancelled) setLocations([]);
      });
    return () => {
      cancelled = true;
    };
  }, [token, requestLocations]);

  useEffect(() => {
    if (!token || !filterKey) return;
    const query = JSON.parse(filterKey) as ChairOccupancyFilters;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await getChairOccupancy(token, query);
        if (cancelled) return;
        setData(res);
        setLoadError(null);
        setForbidden(false);
      } catch (err) {
        if (cancelled) return;
        setForbidden(err instanceof ApiError && err.status === 403 && !query.locationId);
        setLoadError(
          apiErrorMessage(err, { fallback: occupancyCopy.loadError, byStatus: { 400: occupancyCopy.badRequest } }),
        );
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, filterKey, reloadKey]);

  /** Reescribe filtros en la URL sin navegar (conserva `?tab=`). */
  function setParams(values: Partial<Record<'periodo' | 'desde' | 'hasta' | 'sede', string>>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(values)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function choosePreset(next: OccupancyPresetKey) {
    // Al pasar a «Personalizado» se parte de las fechas que se veían.
    if (next === 'personalizado' && period) setParams({ periodo: next, desde: period.from, hasta: period.to });
    else setParams({ periodo: next === 'semana' ? '' : next, desde: '', hasta: '' });
  }

  async function exportCsv() {
    if (!filterKey) return;
    setExporting(true);
    setNotice(null);
    try {
      const query = JSON.parse(filterKey) as ChairOccupancyFilters;
      const text = await downloadChairOccupancyCsv(token, query);
      saveCsv(text, `ocupacion-sillones-${query.from}-${query.to}.csv`, { bom: true });
      setNotice(occupancyCopy.exported);
    } catch (err) {
      notifyError(apiErrorMessage(err, { fallback: occupancyCopy.exportError }), {
        onRetry: () => void exportCsv(),
      });
    } finally {
      setExporting(false);
    }
  }

  if (forbidden) {
    return (
      <EmptyState
        role="status"
        icon={<Lock aria-hidden />}
        title={occupancyCopy.forbiddenTitle}
        description={occupancyCopy.forbiddenHint}
      />
    );
  }

  const c = occupancyCopy;
  const showLoading = !invalidPeriod && (loading || !filters);
  const visible = data?.locations ?? [];

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="t-caption inline-flex items-center gap-1.5 text-muted">
        <Armchair aria-hidden className="size-4 shrink-0" />
        <span>{c.scope}</span>
      </p>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-4">
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-end">
          <FormField htmlFor={`${ids}-period`} label={c.period} className="sm:w-48">
            <NativeSelect
              id={`${ids}-period`}
              value={preset}
              onChange={(e) => choosePreset(e.target.value as OccupancyPresetKey)}
            >
              {OCCUPANCY_PRESETS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          {preset === 'personalizado' && period ? (
            <FormField htmlFor={`${ids}-dates`} label={c.dates} className="sm:w-72">
              <DateRangePicker
                id={`${ids}-dates`}
                value={period}
                onChange={(range) => {
                  if (range) setParams({ periodo: 'personalizado', desde: range.from, hasta: range.to });
                }}
                startLabel={c.from}
                endLabel={c.to}
                isInvalid={invalidPeriod}
                aria-describedby={invalidPeriod ? periodErrorId : undefined}
              />
            </FormField>
          ) : null}
          <FormField htmlFor={`${ids}-location`} label={c.location} className="min-w-0 sm:w-48">
            <NativeSelect
              id={`${ids}-location`}
              value={locationId}
              onChange={(e) => setParams({ sede: e.target.value })}
              disabled={!locations}
            >
              <option value="">{c.locationAll}</option>
              {locations?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.isActive ? l.name : `${l.name} ${c.inactive}`}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        </div>
        {isAdmin ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => void exportCsv()}
            disabled={exporting || showLoading || invalidPeriod || Boolean(loadError)}
            className="shrink-0 self-start lg:self-auto"
          >
            <Download aria-hidden />
            {exporting ? c.exporting : c.export}
          </Button>
        ) : null}
      </div>

      <p role="status" className={notice ? 'text-sm text-success-text' : 'sr-only'}>
        {notice}
      </p>

      {invalidPeriod ? <InlineError id={periodErrorId}>{c.badRequest}</InlineError> : null}

      {data && fmt && !invalidPeriod && !showLoading && !loadError ? (
        <p className="text-sm text-muted tabular-nums">
          {c.periodLine(fmt.civilDate(data.from.slice(0, 10)), fmt.civilDate(data.to.slice(0, 10)))}
        </p>
      ) : null}

      {data?.restrictedToLocations && !showLoading && !loadError ? (
        <Callout tone="info" role="note" data-testid="occupancy-restricted" className="max-w-[80ch] self-start py-2">
          {c.restricted}
        </Callout>
      ) : null}

      <HowItIsCalculated />

      {invalidPeriod ? null : zone.status === 'error' && !period ? (
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
          isEmpty={!visible.some(locationHasRows)}
          emptyTitle={c.empty}
          emptyDescription={c.emptyHint}
          skeleton={<TableSkeleton rows={4} />}
        >
          {fmt ? (
            <div className="flex min-w-0 flex-col gap-6">
              {visible.map((location) => (
                <LocationSection key={location.locationId} location={location} fmt={fmt} />
              ))}
            </div>
          ) : null}
        </AsyncSection>
      )}
    </div>
  );
}
