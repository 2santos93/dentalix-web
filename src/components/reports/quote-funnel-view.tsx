'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Building2, Download, Lock, UserRound } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { readyTimeZone, sedeToday, useSedeTimeZone } from '@/lib/locations/use-sede-time-zone';
import { readyFormat, useSedeFormat } from '@/lib/locations/use-sede-format';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { moneyWithCode } from '@/lib/format/sede-number';
import { saveCsv } from '@/lib/files/save-csv';
import { isValidPeriod, PERIOD_PRESETS, periodFor, type PeriodPresetKey } from '@/lib/reports/period-presets';
import { isCivilDate } from '@/lib/reports/chair-occupancy-api';
import { REJECTION_REASON_LABELS } from '@/lib/treatment-plans/plan-options';
import {
  downloadQuoteFunnelCsv,
  getQuoteFunnel,
  hasPresentations,
  QUOTE_FUNNEL_OUTCOMES,
  QUOTE_FUNNEL_PROFESSIONAL_FIELD,
  QUOTE_FUNNEL_STEP_LABELS,
  type QuoteFunnelCountAmount,
  type QuoteFunnelDefinition,
  type QuoteFunnelFilters,
  type QuoteFunnelProfessionalRow,
  type QuoteFunnelReport,
  type QuoteFunnelStepKey,
} from '@/lib/reports/quote-funnel-api';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { notifyError } from '@/components/errors/notify';
import { InlineError } from '@/components/errors/inline-error';
import { Button } from '@/components/ui/button';
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
import { cn } from '@/lib/utils';
import { HowCalculated } from './how-calculated';
import { RankedBars } from './ranked-bars';
import { Stat, StatGroup } from './stat-group';
import { QuoteFunnelPresentationsDialog, type OpenQuoteFunnelFigure } from './quote-funnel-presentations-dialog';

export const quoteFunnelCopy = {
  scopeClinic: 'Presupuestos de la clínica',
  scopeOwn: 'Solo tus presupuestos: los que elaboraste',
  scopeAllLocations: 'consolidado de tus sedes',
  scopeLocation: (name: string) => `sede ${name}`,
  scopeCurrency: (currency: string) => `Importes en ${currency}`,
  period: 'Período',
  dates: 'Fechas',
  from: 'Desde',
  to: 'Hasta',
  location: 'Sede donde se presentó',
  locationAll: 'Todas tus sedes',
  professional: 'Profesional que lo elaboró',
  professionalAll: 'Todo el equipo',
  inactive: '(desactivada)',
  export: 'Descargar CSV',
  exporting: 'Descargando…',
  exported: 'Informe descargado.',
  exportError: 'No pudimos descargar el informe.',
  periodLine: (from: string, to: string) =>
    from === to ? `Presentados el ${from}, y lo que pasó después hasta hoy` : `Presentados del ${from} al ${to}, y lo que pasó después hasta hoy`,
  restricted: 'Solo incluye tus sedes.',
  withoutRate: (n: number) =>
    `${n === 1 ? '1 presentación tiene' : `${n} presentaciones tienen`} procedimientos en otra moneda sin tasa guardada: ${n === 1 ? 'cuenta' : 'cuentan'} en los números pero no en los importes.`,
  noCatalogCurrency:
    'La clínica no tiene una moneda de catálogo que se pueda resolver: el embudo cuenta las presentaciones, pero no puede dar importes.',
  stepsTitle: 'Del presupuesto al cobro',
  stepsCaption:
    'Cada barra, sobre los presentados: número · % de los presentados · importe. No es un embudo estricto: un abono anticipado ya cuenta como cobrado aunque no haya cita.',
  acceptanceTitle: 'Aceptación',
  byCount: 'Tasa por número',
  byCountHint: 'Aceptados ÷ presentados',
  byAmount: 'Tasa por importe',
  byAmountHint: 'Importe aceptado ÷ importe presentado',
  median: 'Días hasta aceptar',
  medianHint: 'Mediana, desde la presentación',
  days: (text: string, value: number) => `${text} ${value === 1 ? 'día' : 'días'}`,
  outcomesTitle: 'Lo que no se aceptó',
  reasonsTitle: 'Motivos de rechazo',
  reasonsCaption: 'Presentaciones rechazadas por el motivo de la opción rechazada más reciente.',
  byProfessionalTitle: 'Por profesional',
  byProfessionalLabel: 'Embudo de presupuestos por profesional',
  howTitle: 'Cómo se calcula',
  columns: {
    professional: 'Profesional que lo elaboró',
    presented: 'Presentados',
    accepted: 'Aceptados',
    byCount: 'Tasa por número',
    byAmount: 'Tasa por importe',
    scheduled: 'Agendados',
    done: 'Realizados',
    collected: 'Cobrados',
    median: 'Días hasta aceptar',
  },
  noValue: '—',
  drill: (count: number, what: string) =>
    `Ver ${count === 1 ? 'la presentación' : `las ${count} presentaciones`} de «${what}»`,
  loadError: 'No pudimos cargar el embudo de presupuestos.',
  badRequest: 'El período no es válido: elige fechas de hasta 366 días con «Desde» anterior o igual a «Hasta».',
  forbiddenTitle: 'Tu rol no tiene acceso al embudo de presupuestos.',
  forbiddenHint:
    'Lo ven la administración, los odontólogos (cada uno, los suyos) y quien tenga acceso a los reportes financieros.',
  empty: 'Sin presupuestos presentados en el período',
  emptyHint: 'Ningún presupuesto se presentó en estas fechas con estos filtros. Prueba con otro período, sede o profesional.',
  loading: 'Cargando el embudo de presupuestos',
};

const LOCATION_TIMEZONE_REQUIRED = 'LOCATION_TIMEZONE_REQUIRED';

/** Las claves de `definitions` que explican cada columna o cifra. */
const STEP_DEFINITION: Record<QuoteFunnelStepKey, QuoteFunnelDefinition['key']> = {
  PRESENTED: 'PRESENTED',
  ACCEPTED: 'ACCEPTED',
  SCHEDULED: 'SCHEDULED',
  DONE: 'DONE',
  COLLECTED: 'COLLECTED',
};

/** Un % de la API (40 = 40 %, 1 decimal) o «—» sin base. */
export function percentText(value: number | null, fmt: RegionalFormat): string {
  return value === null ? quoteFunnelCopy.noValue : fmt.percent(value, 1);
}

/** Un importe en la moneda del catálogo o «—» (sin moneda o fuera de los importes). */
export function amountText(amount: number | null, currency: string | null, fmt: RegionalFormat): string {
  return amount === null || currency === null ? quoteFunnelCopy.noValue : moneyWithCode(amount, currency, fmt);
}

function daysText(value: number | null, fmt: RegionalFormat): string {
  return value === null ? quoteFunnelCopy.noValue : quoteFunnelCopy.days(fmt.number(value, { max: 1 }), value);
}

/**
 * Una cifra que abre las presentaciones que la forman (si hay alguna): el
 * número subrayado con puntos en el color de enlace, como en Rentabilidad.
 */
function FigureButton({
  count,
  children,
  label,
  onOpen,
  className,
}: {
  count: number;
  children: React.ReactNode;
  label: string;
  onOpen: () => void;
  className?: string;
}) {
  if (count === 0) return <span className={cn('whitespace-nowrap tabular-nums text-muted', className)}>{children}</span>;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      className={cn(
        'inline-flex min-h-8 items-center whitespace-nowrap rounded tabular-nums text-primary-text underline decoration-dotted underline-offset-4 hover:decoration-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text max-sm:min-h-11',
        className,
      )}
    >
      {children}
    </button>
  );
}

function definitionText(definitions: readonly QuoteFunnelDefinition[], key: QuoteFunnelDefinition['key']): string | null {
  const def = definitions.find((d) => d.key === key);
  return def ? def.howItIsCalculated.join(' ') : null;
}

function HeaderWithHow({
  label,
  definitions,
  definition,
}: {
  label: string;
  definitions: readonly QuoteFunnelDefinition[];
  definition: QuoteFunnelDefinition['key'];
}) {
  const text = definitionText(definitions, definition);
  return (
    <span className="inline-flex items-center justify-end gap-0.5">
      {label}
      {text ? <HowCalculated column={label} text={text} /> : null}
    </span>
  );
}

/** Los cinco pasos como barras en su orden, cada una relativa a los presentados. */
function StepsChart({
  report,
  fmt,
  onOpen,
}: {
  report: QuoteFunnelReport;
  fmt: RegionalFormat;
  onOpen: (figure: OpenQuoteFunnelFigure) => void;
}) {
  const c = quoteFunnelCopy;
  const presented = report.steps.find((s) => s.key === 'PRESENTED')?.count ?? 0;
  const bars = report.steps.map((step) => {
    const label = QUOTE_FUNNEL_STEP_LABELS[step.key];
    const amount = amountText(step.amount, report.currency, fmt);
    const rate = percentText(step.rateOfPresented, fmt);
    return {
      key: step.key,
      name: label,
      value: step.count,
      display: (
        <FigureButton
          count={step.count}
          label={`${label}: ${fmt.number(step.count)}, ${rate} de los presentados, ${amount}. ${c.drill(step.count, label)}`}
          onOpen={() => onOpen({ step: step.key, title: label, count: step.count })}
        >
          <span data-testid={`quote-funnel-step-${step.key}`}>
            {fmt.number(step.count)} · {rate} · {amount}
          </span>
        </FigureButton>
      ),
    };
  });
  return (
    <Card className="p-4 sm:p-6">
      <RankedBars title={c.stepsTitle} caption={c.stepsCaption} bars={bars} sort={false} max={presented} className="max-w-3xl" />
    </Card>
  );
}

function Summary({
  report,
  fmt,
  onOpen,
}: {
  report: QuoteFunnelReport;
  fmt: RegionalFormat;
  onOpen: (figure: OpenQuoteFunnelFigure) => void;
}) {
  const c = quoteFunnelCopy;
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      <StatGroup title={c.acceptanceTitle} className="grid-cols-2 sm:grid-cols-3">
        <Stat
          testId="quote-funnel-by-count"
          label={c.byCount}
          value={percentText(report.acceptanceRate.byCount, fmt)}
          hint={c.byCountHint}
        />
        <Stat
          testId="quote-funnel-by-amount"
          label={c.byAmount}
          value={percentText(report.acceptanceRate.byAmount, fmt)}
          hint={c.byAmountHint}
        />
        <Stat
          testId="quote-funnel-median"
          label={c.median}
          value={daysText(report.medianDaysToAccept, fmt)}
          hint={c.medianHint}
          className="col-span-2 sm:col-span-1"
        />
      </StatGroup>
      <StatGroup title={c.outcomesTitle} className="grid-cols-1 sm:grid-cols-3">
        {QUOTE_FUNNEL_OUTCOMES.map((o) => {
          const figure = report.outcomes[o.key];
          return (
            <Stat
              key={o.key}
              testId={`quote-funnel-outcome-${o.key}`}
              label={o.label}
              value={
                <FigureButton
                  count={figure.count}
                  label={`${o.label}: ${fmt.number(figure.count)}. ${c.drill(figure.count, o.label)}`}
                  onOpen={() => onOpen({ step: o.step, title: o.label, count: figure.count })}
                >
                  {fmt.number(figure.count)}
                </FigureButton>
              }
              hint={amountText(figure.amount, report.currency, fmt)}
            />
          );
        })}
      </StatGroup>
    </div>
  );
}

function ReasonsChart({
  report,
  fmt,
  onOpen,
}: {
  report: QuoteFunnelReport;
  fmt: RegionalFormat;
  onOpen: (figure: OpenQuoteFunnelFigure) => void;
}) {
  const c = quoteFunnelCopy;
  if (report.rejectionReasons.length === 0) return null;
  const bars = report.rejectionReasons.map((r) => {
    const label = REJECTION_REASON_LABELS[r.reason];
    const title = `${QUOTE_FUNNEL_OUTCOMES[1].label} · ${label}`;
    return {
      key: r.reason,
      name: label,
      value: r.count,
      display: (
        <FigureButton
          count={r.count}
          label={`${label}: ${fmt.number(r.count)}, ${amountText(r.amount, report.currency, fmt)}. ${c.drill(r.count, title)}`}
          onOpen={() => onOpen({ step: 'REJECTED', reason: r.reason, title, count: r.count })}
        >
          <span data-testid={`quote-funnel-reason-${r.reason}`}>
            {fmt.number(r.count)} · {amountText(r.amount, report.currency, fmt)}
          </span>
        </FigureButton>
      ),
    };
  });
  return (
    <Card className="p-4 sm:p-6">
      {/* En el orden de la API (número y luego importe), no reordenado aquí. */}
      <RankedBars
        title={c.reasonsTitle}
        caption={c.reasonsCaption}
        bars={bars}
        sort={false}
        max={report.outcomes.rejected.count}
        className="max-w-3xl"
      />
    </Card>
  );
}

function ProfessionalTable({
  report,
  fmt,
  onOpen,
}: {
  report: QuoteFunnelReport;
  fmt: RegionalFormat;
  onOpen: (figure: OpenQuoteFunnelFigure) => void;
}) {
  const c = quoteFunnelCopy;
  const defs = report.definitions;
  /** Un paso de la fila: el número (que abre lo suyo) y, debajo, su importe. */
  const stepCell = (row: QuoteFunnelProfessionalRow, step: QuoteFunnelStepKey) => {
    const figure: QuoteFunnelCountAmount = row[QUOTE_FUNNEL_PROFESSIONAL_FIELD[step]];
    const label = QUOTE_FUNNEL_STEP_LABELS[step];
    const title = `${label} · ${row.name}`;
    // «Sin atribuir» no se puede filtrar (no hay a quién): su número no abre detalle.
    const count =
      row.professionalId === null ? (
        <span className="whitespace-nowrap tabular-nums text-ink">{fmt.number(figure.count)}</span>
      ) : (
        <FigureButton
          count={figure.count}
          label={`${title}: ${fmt.number(figure.count)}. ${c.drill(figure.count, title)}`}
          onOpen={() =>
            onOpen({ step, providerId: row.professionalId ?? undefined, title, count: figure.count })
          }
        >
          {fmt.number(figure.count)}
        </FigureButton>
      );
    return (
      <span className="flex flex-col items-end">
        {count}
        <span className="whitespace-nowrap text-xs tabular-nums text-muted">
          {amountText(figure.amount, report.currency, fmt)}
        </span>
      </span>
    );
  };
  const stepColumn = (id: string, step: QuoteFunnelStepKey, header: string): DataListColumn<QuoteFunnelProfessionalRow> => ({
    id,
    header: <HeaderWithHow label={header} definitions={defs} definition={STEP_DEFINITION[step]} />,
    numeric: true,
    cell: (r) => stepCell(r, step),
  });
  const columns: DataListColumn<QuoteFunnelProfessionalRow>[] = [
    {
      id: 'professional',
      header: <HeaderWithHow label={c.columns.professional} definitions={defs} definition="PROFESSIONAL" />,
      mobile: 'primary',
      cell: (r) => <span className={cn('text-ink', r.professionalId === null && 'text-muted')}>{r.name}</span>,
    },
    stepColumn('presented', 'PRESENTED', c.columns.presented),
    stepColumn('accepted', 'ACCEPTED', c.columns.accepted),
    {
      id: 'byCount',
      header: <HeaderWithHow label={c.columns.byCount} definitions={defs} definition="ACCEPTANCE_RATE" />,
      numeric: true,
      cell: (r) => <span className="tabular-nums">{percentText(r.acceptanceRate.byCount, fmt)}</span>,
    },
    {
      id: 'byAmount',
      header: c.columns.byAmount,
      numeric: true,
      cell: (r) => <span className="tabular-nums">{percentText(r.acceptanceRate.byAmount, fmt)}</span>,
    },
    stepColumn('scheduled', 'SCHEDULED', c.columns.scheduled),
    stepColumn('done', 'DONE', c.columns.done),
    stepColumn('collected', 'COLLECTED', c.columns.collected),
    {
      id: 'median',
      header: <HeaderWithHow label={c.columns.median} definitions={defs} definition="MEDIAN_DAYS_TO_ACCEPT" />,
      numeric: true,
      cell: (r) => <span className="whitespace-nowrap tabular-nums">{daysText(r.medianDaysToAccept, fmt)}</span>,
    },
  ];
  return (
    <section className="flex min-w-0 flex-col gap-2" aria-label={c.byProfessionalTitle}>
      <h3 className="t-label text-ink">{c.byProfessionalTitle}</h3>
      <DataList
        label={c.byProfessionalLabel}
        rows={report.byProfessional}
        columns={columns}
        getRowKey={(r) => r.professionalId ?? 'unattributed'}
        phone="scroll"
      />
    </section>
  );
}

function FunnelSkeleton() {
  return (
    <div role="status" aria-label={quoteFunnelCopy.loading} className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-4 sm:p-6">
        <Skeleton className="h-3 w-40" />
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </Card>
      <TableSkeleton rows={3} />
    </div>
  );
}

/**
 * «Presupuestos» (DX-558), pestaña de Reportes: el embudo de los presupuestos
 * PRESENTADOS en el período (día civil de la sede donde se presentaron) y lo
 * que pasó después, hasta hoy: aceptados, agendados, realizados y cobrados,
 * con la tasa de aceptación por número e importe, los días hasta aceptar, lo
 * no aceptado y los motivos de rechazo, y una fila por quien lo elaboró. Todo
 * en la moneda del catálogo (la API convierte con la tasa guardada en cada
 * ítem). Cada cifra abre sus presentaciones. Un odontólogo ve solo lo suyo
 * (`scope: 'OWN'`, sin filtro de profesional). Período, sede y profesional
 * viven en la URL (`?periodo=`, `?desde=`, `?hasta=`, `?sede=`,
 * `?profesional=`). El CSV, solo ADMIN.
 */
export function QuoteFunnelView({
  token,
  isAdmin,
  ownByRole = false,
}: {
  token: string;
  isAdmin: boolean;
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
  const preset: PeriodPresetKey = PERIOD_PRESETS.some((p) => p.key === presetParam)
    ? (presetParam as PeriodPresetKey)
    : 'this_month';
  const fromParam = searchParams.get('desde');
  const toParam = searchParams.get('hasta');
  const locationId = searchParams.get('sede') ?? '';
  const providerParam = searchParams.get('profesional') ?? '';
  const customPeriod =
    isCivilDate(fromParam) && isCivilDate(toParam)
      ? { from: fromParam, to: toParam }
      : today
        ? periodFor('this_month', today)
        : null;
  const period = preset === 'custom' ? customPeriod : today ? periodFor(preset, today) : null;
  const invalidPeriod = preset === 'custom' && period !== null && !isValidPeriod(period);

  const [data, setData] = useState<QuoteFunnelReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [zoneError, setZoneError] = useState<{ message: string; locationId: string | null } | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [opened, setOpened] = useState<OpenQuoteFunnelFigure | null>(null);

  // Con scope OWN la API ya acota a quien consulta: el filtro no se ve ni se manda.
  const own = data?.scope === 'OWN';
  const providerId = own || ownByRole ? '' : providerParam;
  const filters: QuoteFunnelFilters | null =
    period && !invalidPeriod
      ? { ...period, ...(locationId ? { locationId } : {}), ...(providerId ? { providerId } : {}) }
      : null;
  const filterKey = filters ? JSON.stringify(filters) : null;

  useEffect(() => {
    if (!token || !filterKey) return;
    const query = JSON.parse(filterKey) as QuoteFunnelFilters;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await getQuoteFunnel(token, query);
        if (cancelled) return;
        setData(res);
        setLoadError(null);
        setZoneError(null);
        setForbidden(false);
      } catch (err) {
        if (cancelled) return;
        setForbidden(err instanceof ApiError && err.status === 403 && !query.locationId && !query.providerId);
        const message = apiErrorMessage(err, {
          fallback: quoteFunnelCopy.loadError,
          byStatus: { 400: quoteFunnelCopy.badRequest },
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

  function choosePreset(next: PeriodPresetKey) {
    // Al pasar a «Personalizado» se parte de las fechas que se veían.
    if (next === 'custom' && period) setParams({ periodo: next, desde: period.from, hasta: period.to });
    else setParams({ periodo: next === 'this_month' ? '' : next, desde: '', hasta: '' });
  }

  async function exportCsv() {
    if (!filterKey) return;
    setExporting(true);
    setNotice(null);
    try {
      const query = JSON.parse(filterKey) as QuoteFunnelFilters;
      const text = await downloadQuoteFunnelCsv(token, query);
      saveCsv(text, `embudo-de-presupuestos-${query.from}-${query.to}.csv`, { bom: true });
      setNotice(quoteFunnelCopy.exported);
    } catch (err) {
      notifyError(apiErrorMessage(err, { fallback: quoteFunnelCopy.exportError }), {
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
        title={quoteFunnelCopy.forbiddenTitle}
        description={quoteFunnelCopy.forbiddenHint}
      />
    );
  }

  const c = quoteFunnelCopy;
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

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p data-testid="quote-funnel-scope" className="t-caption inline-flex items-center gap-1.5 text-muted">
        {own ? <UserRound aria-hidden className="size-4 shrink-0" /> : <Building2 aria-hidden className="size-4 shrink-0" />}
        <span>{scopeText}</span>
      </p>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-4">
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-end">
          <FormField htmlFor={`${ids}-period`} label={c.period} className="sm:w-48">
            <NativeSelect id={`${ids}-period`} value={preset} onChange={(e) => choosePreset(e.target.value as PeriodPresetKey)}>
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
        {isAdmin ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => void exportCsv()}
            disabled={exporting || showLoading || invalidPeriod || Boolean(loadError) || Boolean(zoneError)}
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

      {ready && data && fmt ? (
        <p className="text-sm text-muted tabular-nums">
          {c.periodLine(fmt.civilDate(data.period.from), fmt.civilDate(data.period.to))}
        </p>
      ) : null}

      {ready && data?.restrictedToLocations ? (
        <Callout tone="info" role="note" data-testid="quote-funnel-restricted" className="max-w-[80ch] self-start py-2">
          {c.restricted}
        </Callout>
      ) : null}
      {ready && data?.warnings.includes('NO_CATALOG_CURRENCY') ? (
        <Callout tone="warning" data-testid="quote-funnel-no-currency" className="max-w-[80ch] self-start py-2">
          {c.noCatalogCurrency}
        </Callout>
      ) : null}
      {ready && data?.warnings.includes('WITHOUT_RATE') && data.withoutRate.presentations > 0 ? (
        <Callout tone="warning" data-testid="quote-funnel-without-rate" className="max-w-[80ch] self-start py-2">
          {c.withoutRate(data.withoutRate.presentations)}
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
          isEmpty={!data || !hasPresentations(data)}
          emptyTitle={c.empty}
          emptyDescription={c.emptyHint}
          skeleton={<FunnelSkeleton />}
        >
          {data && fmt ? (
            <div className="flex min-w-0 flex-col gap-6">
              <StepsChart report={data} fmt={fmt} onOpen={setOpened} />
              <Summary report={data} fmt={fmt} onOpen={setOpened} />
              <ReasonsChart report={data} fmt={fmt} onOpen={setOpened} />
              {data.byProfessional.length > 0 ? <ProfessionalTable report={data} fmt={fmt} onOpen={setOpened} /> : null}
              {definitions.length > 0 ? (
                <div className="-mx-2 max-w-[80ch] self-start" data-testid="quote-funnel-how">
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

      {filters && fmt ? (
        <QuoteFunnelPresentationsDialog
          token={token}
          filters={filters}
          opened={opened}
          fmt={fmt}
          onClose={() => setOpened(null)}
        />
      ) : null}
    </div>
  );
}
