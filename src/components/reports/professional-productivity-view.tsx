'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { Building2, Download, Lock, UserRound } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { readyFormat, useSedeFormat } from '@/lib/locations/use-sede-format';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { moneyWithCode } from '@/lib/format/sede-number';
import { saveCsv } from '@/lib/files/save-csv';
import {
  downloadProfessionalProductivityCsv,
  getProfessionalProductivity,
  type ProductivityFigures,
  type ProductivityRow,
  type ProfessionalProductivity,
  type ProfessionalReportFilters,
} from '@/lib/reports/professional-reports-api';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { InlineError } from '@/components/errors/inline-error';
import { notifyError } from '@/components/errors/notify';
import { Button } from '@/components/ui/button';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { Disclosure } from '@/components/shared/disclosure';
import { EmptyState } from '@/components/shared/empty-state';
import { HowCalculated } from './how-calculated';
import { Stat, StatGroup } from './stat-group';
import {
  ProfessionalReportFilterBar,
  professionalFiltersCopy,
  useProfessionalReportFilters,
} from './professional-report-filters';

export const productivityCopy = {
  scopeClinic: 'Todo el equipo · importes por moneda, sin convertir',
  scopeOwn: 'Solo lo tuyo · importes por moneda, sin convertir',
  periodLine: (from: string, to: string) => (from === to ? `Del ${from}` : `Del ${from} al ${to}`),
  totalsTitle: 'Total del período',
  listTitle: 'Por profesional',
  listLabel: 'Productividad por profesional',
  columns: {
    professional: 'Profesional',
    production: 'Producción',
    collected: 'Cobrado',
    completed: 'Atendidas',
    noShows: 'No asistió',
    late: 'Tardías',
    noShowRate: 'No-show',
  },
  completedMeta: (n: string) => `${n} atendidas`,
  noShowMeta: (rate: string) => `No-show ${rate}`,
  proceduresHint: (n: string) => `${n} procedimientos`,
  howTitle: 'Cómo se calcula',
  export: 'Exportar CSV',
  exporting: 'Exportando…',
  exported: 'Reporte exportado.',
  exportError: 'No pudimos exportar el reporte.',
  noValue: '—',
  loadError: 'No pudimos cargar la productividad por profesional.',
  forbiddenTitle: 'Tu rol no tiene acceso a la productividad por profesional.',
  forbiddenHint:
    'La ven la administración, los odontólogos (cada uno, la suya) y quien tenga acceso a los reportes financieros.',
  empty: 'Sin actividad en el período',
  emptyHint: 'Nadie realizó procedimientos, cobró ni atendió citas en estas fechas. Prueba con otro período o sede.',
  loading: 'Cargando la productividad',
};

const LOCATION_TIMEZONE_REQUIRED = 'LOCATION_TIMEZONE_REQUIRED';

/** Una línea por moneda (nunca sumadas); sin importes, «—». */
function MoneyLines({
  amounts,
  fmt,
}: {
  amounts: { currency: string; value: number }[];
  fmt: RegionalFormat;
}) {
  if (amounts.length === 0) return <span className="text-muted">{productivityCopy.noValue}</span>;
  return (
    <span className="flex flex-col items-end tabular-nums">
      {amounts.map((a) => (
        <span key={a.currency} className="whitespace-nowrap">
          {moneyWithCode(a.value, a.currency, fmt)}
        </span>
      ))}
    </span>
  );
}

const production = (f: ProductivityFigures) => f.production.map((p) => ({ currency: p.currency, value: p.net }));
const collected = (f: ProductivityFigures) => f.collected.map((p) => ({ currency: p.currency, value: p.amount }));
const moneyText = (amounts: { currency: string; value: number }[], fmt: RegionalFormat) =>
  amounts.map((a) => moneyWithCode(a.value, a.currency, fmt)).join(' · ');
const rateText = (rate: number | null, fmt: RegionalFormat) =>
  rate === null ? productivityCopy.noValue : fmt.percent(rate, 1);

function Totals({ report, fmt }: { report: ProfessionalProductivity; fmt: RegionalFormat }) {
  const c = productivityCopy;
  const t = report.totals;
  const procedures = t.production.reduce((n, p) => n + p.count, 0);
  return (
    <StatGroup title={c.totalsTitle} className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      <Stat
        label={c.columns.production}
        testId="productivity-total-production"
        value={production(t).length > 0 ? <MoneyStack amounts={production(t)} fmt={fmt} /> : c.noValue}
        hint={c.proceduresHint(fmt.number(procedures))}
      />
      <Stat
        label={c.columns.collected}
        testId="productivity-total-collected"
        value={collected(t).length > 0 ? <MoneyStack amounts={collected(t)} fmt={fmt} /> : c.noValue}
      />
      <Stat label={c.columns.completed} value={fmt.number(t.completedAppointments)} />
      <Stat
        label={c.columns.noShowRate}
        testId="productivity-total-no-show"
        value={rateText(t.noShowRate, fmt)}
        hint={`${fmt.number(t.noShows)} ${c.columns.noShows.toLowerCase()} · ${fmt.number(t.lateCancellations)} ${c.columns.late.toLowerCase()}`}
      />
    </StatGroup>
  );
}

function MoneyStack({ amounts, fmt }: { amounts: { currency: string; value: number }[]; fmt: RegionalFormat }) {
  return (
    <span className="flex flex-col">
      {amounts.map((a) => (
        <span key={a.currency}>{moneyWithCode(a.value, a.currency, fmt)}</span>
      ))}
    </span>
  );
}

function ProductivityList({ report, fmt }: { report: ProfessionalProductivity; fmt: RegionalFormat }) {
  const c = productivityCopy;
  const how = (key: string) => report.definitions.find((d) => d.key === key)?.howItIsCalculated;
  const header = (label: string, key: string) => {
    const text = how(key);
    return (
      <span className="inline-flex items-center justify-end gap-0.5">
        {label}
        {text ? <HowCalculated column={label} text={text} /> : null}
      </span>
    );
  };
  const columns: DataListColumn<ProductivityRow>[] = [
    {
      id: 'professional',
      header: c.columns.professional,
      mobile: 'primary',
      cell: (r) => <span className="font-medium text-ink">{r.fullName}</span>,
    },
    {
      id: 'production',
      header: header(c.columns.production, 'production'),
      numeric: true,
      mobile: 'trailing',
      cell: (r) => <MoneyLines amounts={production(r)} fmt={fmt} />,
      mobileCell: (r) => (r.production.length > 0 ? moneyText(production(r), fmt) : c.noValue),
    },
    {
      id: 'collected',
      header: header(c.columns.collected, 'collected'),
      numeric: true,
      cell: (r) => <MoneyLines amounts={collected(r)} fmt={fmt} />,
      // Nunca se esconde dinero en el teléfono (DESIGN.md).
      mobileCell: (r) => (r.collected.length > 0 ? `${c.columns.collected} ${moneyText(collected(r), fmt)}` : null),
    },
    {
      id: 'completed',
      header: header(c.columns.completed, 'completedAppointments'),
      numeric: true,
      cell: (r) => <span className="tabular-nums">{fmt.number(r.completedAppointments)}</span>,
      mobileCell: (r) => c.completedMeta(fmt.number(r.completedAppointments)),
    },
    {
      id: 'noShows',
      header: c.columns.noShows,
      numeric: true,
      showFrom: 'md',
      cell: (r) => <span className="tabular-nums">{fmt.number(r.noShows)}</span>,
      mobile: 'hidden',
    },
    {
      id: 'late',
      header: c.columns.late,
      numeric: true,
      showFrom: 'md',
      cell: (r) => <span className="tabular-nums">{fmt.number(r.lateCancellations)}</span>,
      mobile: 'hidden',
    },
    {
      id: 'noShowRate',
      header: header(c.columns.noShowRate, 'noShowRate'),
      numeric: true,
      cell: (r) => <span className="tabular-nums">{rateText(r.noShowRate, fmt)}</span>,
      mobileCell: (r) => (r.noShowRate === null ? null : c.noShowMeta(rateText(r.noShowRate, fmt))),
    },
  ];
  return (
    <section className="flex min-w-0 flex-col gap-2" aria-label={c.listTitle}>
      <h3 className="t-label text-ink">{c.listTitle}</h3>
      <DataList label={c.listLabel} rows={report.rows} columns={columns} getRowKey={(r) => r.professionalId} />
    </section>
  );
}

/**
 * «Profesionales» (DX-304), pestaña de Reportes: producción atribuible,
 * cobrado atribuible, citas atendidas y no-show % de cada profesional en el
 * período, por moneda (nunca sumadas). Un odontólogo ve solo su fila (la API
 * acota: `scope: 'OWN'`, sin filtro de profesional). Filtros en la URL.
 */
export function ProfessionalProductivityView({ token, ownByRole = false }: { token: string; ownByRole?: boolean }) {
  const sedeFormat = useSedeFormat(token);
  const fmt = readyFormat(sedeFormat);
  const periodErrorId = `${React.useId()}-period-error`;
  const [data, setData] = useState<ProfessionalProductivity | null>(null);
  const own = data?.scope === 'OWN' || ownByRole;
  const state = useProfessionalReportFilters(token, own);
  const { filterKey, invalidPeriod, period, zone } = state;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [zoneError, setZoneError] = useState<{ message: string; locationId: string | null } | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !filterKey) return;
    const query = JSON.parse(filterKey) as ProfessionalReportFilters;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await getProfessionalProductivity(token, query);
        if (cancelled) return;
        setData(res);
        setLoadError(null);
        setZoneError(null);
        setForbidden(false);
      } catch (err) {
        if (cancelled) return;
        // Un 403 sin filtros es el rol; con sede o profesional, ese filtro (se ve el mensaje).
        setForbidden(err instanceof ApiError && err.status === 403 && !query.locationId && !query.professionalId);
        const message = apiErrorMessage(err, {
          fallback: productivityCopy.loadError,
          byStatus: { 400: professionalFiltersCopy.badRequest },
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

  async function exportCsv() {
    if (!filterKey) return;
    setExporting(true);
    setNotice(null);
    try {
      const query = JSON.parse(filterKey) as ProfessionalReportFilters;
      const text = await downloadProfessionalProductivityCsv(token, query);
      saveCsv(text, `productividad-profesionales-${query.from}-${query.to}.csv`, { bom: true });
      setNotice(productivityCopy.exported);
    } catch (err) {
      notifyError(apiErrorMessage(err, { fallback: productivityCopy.exportError }), {
        onRetry: () => void exportCsv(),
      });
    } finally {
      setExporting(false);
    }
  }

  const c = productivityCopy;
  if (forbidden) {
    return <EmptyState role="status" icon={<Lock aria-hidden />} title={c.forbiddenTitle} description={c.forbiddenHint} />;
  }

  const showLoading = !invalidPeriod && (loading || !filterKey);
  const ready = Boolean(data && fmt && !showLoading && !loadError && !zoneError && !invalidPeriod);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p data-testid="productivity-scope" className="t-caption inline-flex items-center gap-1.5 text-muted">
        {own ? <UserRound aria-hidden className="size-4 shrink-0" /> : <Building2 aria-hidden className="size-4 shrink-0" />}
        <span>{own ? c.scopeOwn : c.scopeClinic}</span>
      </p>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-4">
        <ProfessionalReportFilterBar state={state} own={own} options={data?.options} periodErrorId={periodErrorId} />
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
      </div>

      <p role="status" className={notice ? 'text-sm text-success-text' : 'sr-only'}>
        {notice}
      </p>

      {invalidPeriod ? <InlineError id={periodErrorId}>{professionalFiltersCopy.badRequest}</InlineError> : null}

      {ready && data && fmt ? (
        <p className="text-sm text-muted tabular-nums">{c.periodLine(fmt.civilDate(data.from), fmt.civilDate(data.to))}</p>
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
          isEmpty={!data?.hasActivity}
          emptyTitle={c.empty}
          emptyDescription={c.emptyHint}
          skeleton={<TableSkeleton rows={4} />}
        >
          {data && fmt ? (
            <div className="flex min-w-0 flex-col gap-6">
              {data.scope === 'CLINIC' ? <Totals report={data} fmt={fmt} /> : null}
              <ProductivityList report={data} fmt={fmt} />
              {data.definitions.length > 0 ? (
                <div className="-mx-2 max-w-[80ch] self-start" data-testid="productivity-how">
                  <Disclosure summary={c.howTitle}>
                    <dl className="flex flex-col gap-3 px-2 text-sm">
                      {data.definitions.map((d) => (
                        <div key={d.key} className="flex flex-col gap-1">
                          <dt className="font-medium text-ink">{d.label}</dt>
                          <dd className="text-muted">{d.howItIsCalculated}</dd>
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
