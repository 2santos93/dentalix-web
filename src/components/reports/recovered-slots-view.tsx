'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Building2, Download, Lock } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { readyTimeZone, sedeToday, useSedeTimeZone } from '@/lib/locations/use-sede-time-zone';
import { readyFormat, useSedeFormat } from '@/lib/locations/use-sede-format';
import { useSessionLocations } from '@/lib/session/session-store';
import { listStaff, type StaffMember } from '@/lib/appointments/staff-api';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { moneyWithCode } from '@/lib/format/sede-number';
import { saveCsv } from '@/lib/files/save-csv';
import {
  downloadRecoveredSlotsCsv,
  formatDurationMinutes,
  getRecoveredSlots,
  isMonth,
  monthOf,
  monthOptions,
  monthPeriod,
  type RecoveredSlotsFilters,
  type RecoveredSlotsMetrics,
  type RecoveredSlotsProviderRow,
  type RecoveredSlotsReport,
  type RecoveredSlotsWeekRow,
} from '@/lib/reports/recovered-slots-api';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { notifyError } from '@/components/errors/notify';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Card } from '@/components/ui/card';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { FormField } from '@/components/shared/form-field';
import { cn } from '@/lib/utils';

export const recoveredCopy = {
  scope:
    'Huecos que dejaron las citas canceladas en el período y cuántos se volvieron a ocupar · valor por moneda, sin convertir ni sumar entre monedas',
  month: 'Mes',
  location: 'Sede',
  locationAll: 'Todas tus sedes',
  provider: 'Profesional',
  providerAll: 'Todo el equipo',
  inactive: '(desactivada)',
  export: 'Descargar CSV',
  exporting: 'Descargando…',
  exported: 'Informe descargado.',
  exportError: 'No pudimos descargar el informe.',
  restricted: 'Solo incluye tus sedes.',
  periodLine: (from: string, to: string) => `Cancelaciones del ${from} al ${to}`,
  noValue: '—',
  sections: {
    slots: 'Huecos',
    rates: 'Relleno',
    offers: 'Ofertas de la lista de espera',
    value: 'Valor recuperado',
  },
  freed: 'Huecos liberados',
  freedHint: (duration: string) => `${duration} de agenda`,
  filled: 'Rellenados',
  filledHint: (partial: number) =>
    partial === 0 ? 'Ninguno a medias' : partial === 1 ? '1 de ellos en parte' : `${partial} de ellos en parte`,
  byList: 'Por la lista de espera',
  fillRate: 'Tasa de relleno',
  cancellationRate: 'Tasa de cancelación',
  cancellationHint: 'Citas del período que se cancelaron',
  within30: 'Rellenados en ≤ 30 min',
  within24h: 'Rellenados en ≤ 24 h',
  meanToFill: 'Tiempo medio hasta rellenar',
  offersSent: 'Enviadas',
  offersAccepted: 'Aceptadas',
  offersDeclined: 'Rechazadas',
  offersUnanswered: 'Sin respuesta',
  noRecoveredValue: 'Sin valor recuperado',
  unvalued: (n: number) => (n === 1 ? '1 hueco recuperado sin valorar' : `${n} huecos recuperados sin valorar`),
  byProviderLabel: 'Huecos recuperados por profesional',
  byWeekLabel: 'Huecos recuperados por semana',
  byProviderTitle: 'Por profesional',
  byWeekTitle: 'Por semana',
  week: (day: string) => `Semana del ${day}`,
  columns: {
    provider: 'Profesional',
    week: 'Semana',
    freed: 'Liberados',
    filled: 'Rellenados',
    fillRate: 'Tasa de relleno',
    cancellationRate: 'Cancelación',
    meanToFill: 'Tiempo medio',
    value: 'Valor recuperado',
  },
  mobileFilled: (filled: number, freed: number) => `${filled} de ${freed} rellenados`,
  mobileFillRate: (rate: string) => `Relleno ${rate}`,
  mobileCancellation: (rate: string) => `Cancelación ${rate}`,
  mobileMean: (duration: string) => `Media ${duration}`,
  loadError: 'No pudimos cargar los huecos recuperados.',
  badRequest: 'El período no es válido. Elige otro mes.',
  forbiddenTitle: 'Tu rol no tiene acceso a los huecos recuperados.',
  forbiddenHint: 'Es para la administración de la clínica.',
  empty: 'Sin cancelaciones en el periodo',
  emptyHint: 'Ninguna cita se canceló en este mes con estos filtros. Prueba con otro mes, sede o profesional.',
  loading: 'Cargando los huecos recuperados',
};

/** Una fracción 0–1 como porcentaje de la sede, o «—» sin base. */
export function rateText(rate: number | null, fmt: RegionalFormat): string {
  return rate === null ? recoveredCopy.noValue : fmt.percent(rate * 100, 1);
}

function meanText(minutes: number | null): string {
  return minutes === null ? recoveredCopy.noValue : formatDurationMinutes(minutes);
}

function valueText(metrics: RecoveredSlotsMetrics, fmt: RegionalFormat): string {
  return metrics.recoveredValue.length === 0
    ? recoveredCopy.noValue
    : metrics.recoveredValue.map((v) => moneyWithCode(v.amount, v.currency, fmt)).join(' · ');
}

/** Una cifra del resumen: etiqueta, valor y, si hace falta, una línea de contexto. */
function Stat({
  label,
  value,
  hint,
  testId,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  testId?: string;
  className?: string;
}) {
  return (
    <div data-testid={testId} className={cn('flex min-w-0 flex-col gap-1 bg-surface p-4', className)}>
      <dt className="t-overline">{label}</dt>
      <dd className="t-data min-w-0 break-words text-xl font-semibold text-ink">{value}</dd>
      {hint ? <dd className="text-xs text-muted">{hint}</dd> : null}
    </div>
  );
}

function StatGroup({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className="flex min-w-0 flex-col gap-2" aria-label={title}>
      <h3 className="t-label text-ink">{title}</h3>
      <dl
        className={cn(
          'grid min-w-0 gap-px overflow-hidden rounded-xl border border-border bg-border-subtle',
          className,
        )}
      >
        {children}
      </dl>
    </section>
  );
}

/**
 * El resumen del período en cuatro bloques. La tasa de cancelación va al
 * lado de la de relleno (lo pide el ticket): un relleno alto con muchas
 * cancelaciones no es una buena noticia.
 */
export function RecoveredSlotsSummary({ totals, fmt }: { totals: RecoveredSlotsMetrics; fmt: RegionalFormat }) {
  const c = recoveredCopy;
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      <StatGroup title={c.sections.slots} className="grid-cols-1 sm:grid-cols-3">
        <Stat
          testId="recovered-freed"
          label={c.freed}
          value={fmt.number(totals.freedSlots)}
          hint={c.freedHint(formatDurationMinutes(totals.freedMinutes))}
        />
        <Stat
          testId="recovered-filled"
          label={c.filled}
          value={fmt.number(totals.filledSlots)}
          hint={c.filledHint(totals.partiallyFilledSlots)}
        />
        <Stat testId="recovered-by-list" label={c.byList} value={fmt.number(totals.filledByListSlots)} />
      </StatGroup>
      <StatGroup title={c.sections.rates} className="grid-cols-2 sm:grid-cols-3" >
        <Stat testId="recovered-fill-rate" label={c.fillRate} value={rateText(totals.fillRate, fmt)} />
        <Stat
          testId="recovered-cancellation-rate"
          label={c.cancellationRate}
          value={rateText(totals.cancellationRate, fmt)}
          hint={c.cancellationHint}
        />
        <Stat
          testId="recovered-mean"
          label={c.meanToFill}
          value={meanText(totals.meanMinutesToFill)}
          className="col-span-2 sm:col-span-1"
        />
        <Stat testId="recovered-within-30" label={c.within30} value={rateText(totals.filledWithin30MinRate, fmt)} />
        <Stat testId="recovered-within-24h" label={c.within24h} value={rateText(totals.filledWithin24hRate, fmt)} />
        <div aria-hidden className="hidden bg-surface sm:block" />
      </StatGroup>
      <StatGroup title={c.sections.offers} className="grid-cols-2 sm:grid-cols-4">
        <Stat testId="offers-sent" label={c.offersSent} value={fmt.number(totals.offers.sent)} />
        <Stat testId="offers-accepted" label={c.offersAccepted} value={fmt.number(totals.offers.accepted)} />
        <Stat testId="offers-declined" label={c.offersDeclined} value={fmt.number(totals.offers.declined)} />
        <Stat testId="offers-unanswered" label={c.offersUnanswered} value={fmt.number(totals.offers.unanswered)} />
      </StatGroup>
      <StatGroup title={c.sections.value} className="grid-cols-1 sm:grid-cols-2">
        {totals.recoveredValue.length === 0 ? (
          <Stat testId="recovered-value" label={c.sections.value} value={c.noRecoveredValue} />
        ) : (
          totals.recoveredValue.map((v) => (
            <Stat
              key={v.currency}
              testId="recovered-value"
              label={v.currency}
              value={moneyWithCode(v.amount, v.currency, fmt)}
            />
          ))
        )}
        {totals.unvaluedRecoveredSlots > 0 ? (
          <Stat
            testId="recovered-unvalued"
            label={c.unvalued(totals.unvaluedRecoveredSlots)}
            value={fmt.number(totals.unvaluedRecoveredSlots)}
            className="sm:col-span-2"
          />
        ) : null}
      </StatGroup>
    </div>
  );
}

/** Columnas comunes a las dos tablas; la primera (quién o qué semana) la pone cada una. */
function metricColumns<T extends RecoveredSlotsMetrics>(fmt: RegionalFormat): DataListColumn<T>[] {
  const c = recoveredCopy.columns;
  return [
    {
      id: 'freed',
      header: c.freed,
      numeric: true,
      cell: (r) => fmt.number(r.freedSlots),
      mobileCell: (r) => recoveredCopy.mobileFilled(r.filledSlots, r.freedSlots),
    },
    {
      id: 'filled',
      header: c.filled,
      numeric: true,
      mobile: 'hidden',
      cell: (r) => fmt.number(r.filledSlots),
    },
    {
      id: 'fillRate',
      header: c.fillRate,
      numeric: true,
      mobile: 'trailing',
      cell: (r) => rateText(r.fillRate, fmt),
      mobileCell: (r) => recoveredCopy.mobileFillRate(rateText(r.fillRate, fmt)),
    },
    {
      id: 'cancellationRate',
      header: c.cancellationRate,
      numeric: true,
      cell: (r) => rateText(r.cancellationRate, fmt),
      mobileCell: (r) => recoveredCopy.mobileCancellation(rateText(r.cancellationRate, fmt)),
    },
    {
      id: 'mean',
      header: c.meanToFill,
      numeric: true,
      cell: (r) => <span className="whitespace-nowrap">{meanText(r.meanMinutesToFill)}</span>,
      mobileCell: (r) => (r.meanMinutesToFill === null ? null : recoveredCopy.mobileMean(meanText(r.meanMinutesToFill))),
    },
    {
      id: 'value',
      header: c.value,
      numeric: true,
      cell: (r) => <span className="whitespace-nowrap">{valueText(r, fmt)}</span>,
      mobileCell: (r) => (r.recoveredValue.length === 0 ? null : valueText(r, fmt)),
    },
  ];
}

function ProviderTable({ rows, fmt }: { rows: RecoveredSlotsProviderRow[]; fmt: RegionalFormat }) {
  const columns: DataListColumn<RecoveredSlotsProviderRow>[] = [
    { id: 'provider', header: recoveredCopy.columns.provider, mobile: 'primary', cell: (r) => r.providerName },
    ...metricColumns<RecoveredSlotsProviderRow>(fmt),
  ];
  return (
    <section className="flex min-w-0 flex-col gap-2" aria-label={recoveredCopy.byProviderTitle}>
      <h3 className="t-label text-ink">{recoveredCopy.byProviderTitle}</h3>
      <DataList label={recoveredCopy.byProviderLabel} rows={rows} columns={columns} getRowKey={(r) => r.providerId} />
    </section>
  );
}

function WeekTable({ rows, fmt }: { rows: RecoveredSlotsWeekRow[]; fmt: RegionalFormat }) {
  const columns: DataListColumn<RecoveredSlotsWeekRow>[] = [
    {
      id: 'week',
      header: recoveredCopy.columns.week,
      mobile: 'primary',
      cell: (r) => <span className="whitespace-nowrap tabular-nums">{recoveredCopy.week(fmt.civilDate(r.weekStart.slice(0, 10)))}</span>,
      mobileCell: (r) => recoveredCopy.week(fmt.civilDate(r.weekStart.slice(0, 10))),
    },
    ...metricColumns<RecoveredSlotsWeekRow>(fmt),
  ];
  return (
    <section className="flex min-w-0 flex-col gap-2" aria-label={recoveredCopy.byWeekTitle}>
      <h3 className="t-label text-ink">{recoveredCopy.byWeekTitle}</h3>
      <DataList label={recoveredCopy.byWeekLabel} rows={rows} columns={columns} getRowKey={(r) => r.weekStart} />
    </section>
  );
}

function RecoveredSkeleton() {
  return (
    <div role="status" aria-label={recoveredCopy.loading} className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i} className="flex flex-col gap-3 p-4">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-8 w-full" />
          </Card>
        ))}
      </div>
      <TableSkeleton rows={3} />
    </div>
  );
}

/**
 * «Huecos recuperados» (DX-436), pestaña de Reportes para la administración:
 * de las citas canceladas en el mes (días civiles de la sede), cuántos huecos
 * se volvieron a ocupar, en cuánto tiempo, cuántos por la lista de espera, con
 * sus ofertas y el valor recuperado por moneda. La tasa de cancelación va al
 * lado de la de relleno. Mes, sede y profesional viven en la URL (`?mes=`,
 * `?sede=`, `?profesional=`) junto a la pestaña, así el enlace se comparte.
 * Debajo, por profesional y por semana (tarjetas a 390 px). El CSV, solo ADMIN.
 */
export function RecoveredSlotsView({ token, isAdmin }: { token: string; isAdmin: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const zone = useSedeTimeZone(token);
  const timeZone = readyTimeZone(zone);
  const sedeFormat = useSedeFormat(token);
  const fmt = readyFormat(sedeFormat);
  const today = timeZone ? sedeToday(timeZone) : null;
  const baseId = React.useId();
  const requestLocations = useSessionLocations(token);

  const monthParam = searchParams.get('mes');
  const month = isMonth(monthParam) ? monthParam : today ? monthOf(today) : null;
  const locationId = searchParams.get('sede') ?? '';
  const providerId = searchParams.get('profesional') ?? '';

  const [locations, setLocations] = useState<{ id: string; name: string; isActive: boolean }[] | null>(null);
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [data, setData] = useState<RecoveredSlotsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const filters: RecoveredSlotsFilters | null = month
    ? {
        ...monthPeriod(month),
        ...(locationId ? { locationId } : {}),
        ...(providerId ? { providerId } : {}),
      }
    : null;
  const filterKey = filters ? JSON.stringify(filters) : null;

  // Opciones de los filtros: si fallan, el filtro sigue con «Todas/Todo el equipo».
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
    listStaff(token)
      .then((members) => {
        if (!cancelled) setStaff(members);
      })
      .catch(() => {
        if (!cancelled) setStaff([]);
      });
    return () => {
      cancelled = true;
    };
  }, [token, requestLocations]);

  useEffect(() => {
    if (!token || !filterKey) return;
    const query = JSON.parse(filterKey) as RecoveredSlotsFilters;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await getRecoveredSlots(token, query);
        if (cancelled) return;
        setData(res);
        setLoadError(null);
        setForbidden(false);
      } catch (err) {
        if (cancelled) return;
        setForbidden(err instanceof ApiError && err.status === 403 && !query.locationId && !query.providerId);
        setLoadError(
          apiErrorMessage(err, { fallback: recoveredCopy.loadError, byStatus: { 400: recoveredCopy.badRequest } }),
        );
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, filterKey, reloadKey]);

  /** Reescribe un filtro en la URL sin navegar (conserva `?tab=`). */
  function setParam(key: 'mes' | 'sede' | 'profesional', value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  async function exportCsv() {
    if (!filterKey) return;
    setExporting(true);
    setNotice(null);
    try {
      const query = JSON.parse(filterKey) as RecoveredSlotsFilters;
      const text = await downloadRecoveredSlotsCsv(token, query);
      saveCsv(text, `huecos-recuperados-${query.from}-${query.to}.csv`, { bom: true });
      setNotice(recoveredCopy.exported);
    } catch (err) {
      notifyError(apiErrorMessage(err, { fallback: recoveredCopy.exportError }), {
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
        title={recoveredCopy.forbiddenTitle}
        description={recoveredCopy.forbiddenHint}
      />
    );
  }

  const months = today ? monthOptions(today) : [];
  if (month && !months.some((m) => m.value === month)) months.push(...monthOptions(`${month}-01`, 1));
  const providers = (staff ?? [])
    .filter((s) => s.role !== 'RECEPTION')
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'));
  const showLoading = loading || !filters;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="t-caption inline-flex items-center gap-1.5 text-muted">
        <Building2 aria-hidden className="size-4 shrink-0" />
        <span>{recoveredCopy.scope}</span>
      </p>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-4">
        <div className="grid min-w-0 grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
          <FormField htmlFor={`${baseId}-month`} label={recoveredCopy.month} className="col-span-2 sm:col-span-1 sm:w-48">
            <NativeSelect
              id={`${baseId}-month`}
              value={month ?? ''}
              onChange={(e) => setParam('mes', e.target.value)}
              disabled={!month}
            >
              {months.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField htmlFor={`${baseId}-location`} label={recoveredCopy.location} className="min-w-0 sm:w-48">
            <NativeSelect
              id={`${baseId}-location`}
              value={locationId}
              onChange={(e) => setParam('sede', e.target.value)}
              disabled={!locations}
            >
              <option value="">{recoveredCopy.locationAll}</option>
              {locations?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.isActive ? l.name : `${l.name} ${recoveredCopy.inactive}`}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField htmlFor={`${baseId}-provider`} label={recoveredCopy.provider} className="min-w-0 sm:w-48">
            <NativeSelect
              id={`${baseId}-provider`}
              value={providerId}
              onChange={(e) => setParam('profesional', e.target.value)}
              disabled={!staff}
            >
              <option value="">{recoveredCopy.providerAll}</option>
              {providers.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.fullName}
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
            disabled={exporting || showLoading || Boolean(loadError)}
            className="shrink-0 self-start lg:self-auto"
          >
            <Download aria-hidden />
            {exporting ? recoveredCopy.exporting : recoveredCopy.export}
          </Button>
        ) : null}
      </div>

      <p role="status" className={notice ? 'text-sm text-success-text' : 'sr-only'}>
        {notice}
      </p>

      {data && fmt && !showLoading && !loadError ? (
        <p className="text-sm text-muted tabular-nums">
          {recoveredCopy.periodLine(fmt.civilDate(data.from.slice(0, 10)), fmt.civilDate(data.to.slice(0, 10)))}
        </p>
      ) : null}

      {data?.restrictedToLocations && !showLoading && !loadError ? (
        <Callout tone="info" role="note" data-testid="recovered-restricted" className="max-w-[80ch] self-start py-2">
          {recoveredCopy.restricted}
        </Callout>
      ) : null}

      {zone.status === 'error' && !month ? (
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
          isEmpty={!data || data.totals.freedSlots === 0}
          emptyTitle={recoveredCopy.empty}
          emptyDescription={recoveredCopy.emptyHint}
          skeleton={<RecoveredSkeleton />}
        >
          {data && fmt ? (
            <div className="flex min-w-0 flex-col gap-6">
              <RecoveredSlotsSummary totals={data.totals} fmt={fmt} />
              {data.byProvider.length > 0 ? <ProviderTable rows={data.byProvider} fmt={fmt} /> : null}
              {data.byWeek.length > 0 ? <WeekTable rows={data.byWeek} fmt={fmt} /> : null}
            </div>
          ) : null}
        </AsyncSection>
      )}
    </div>
  );
}
