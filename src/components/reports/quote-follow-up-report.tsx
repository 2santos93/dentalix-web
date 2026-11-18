'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import type { RegionalFormat } from '@/lib/format/regional-format';
import {
  FOLLOW_UP_ACCEPTANCE_WINDOW_DAYS,
  FOLLOW_UP_REASON_LABELS,
  followUpStepLabel,
  getQuoteFollowUpReport,
  type QuoteFollowUpDefinition,
  type QuoteFollowUpReport,
  type QuoteFollowUpReportFilters,
  type QuoteFollowUpStepStats,
} from '@/lib/treatment-plans/quote-follow-up-api';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { Disclosure } from '@/components/shared/disclosure';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { HowCalculated } from './how-calculated';

export const quoteFollowUpReportCopy = {
  title: 'Seguimiento automático',
  caption: (days: number) =>
    `Los avisos por email a presupuestos presentados sin respuesta, por la fecha en que salieron (o se omitieron), y cuántos terminaron en una aceptación en los ${days} días siguientes.`,
  providerIgnored: 'Este bloque no se filtra por profesional: cuenta los avisos de todo el equipo que ves.',
  tableLabel: 'Seguimiento automático por aviso',
  colStep: 'Aviso',
  colSent: 'Enviados',
  colOpened: 'Abiertos',
  colAccepted: (days: number) => `Aceptados en ${days} días`,
  colRate: 'Tasa de aceptación',
  total: 'Total',
  ofSent: (rate: string) => `${rate} de los enviados`,
  skippedTitle: 'Avisos que no salieron',
  skippedLabel: 'Avisos que no salieron, por motivo',
  howTitle: 'Cómo se calcula el seguimiento',
  noValue: '—',
  empty: 'Ningún aviso automático en el período',
  emptyHint:
    'No salió ni se omitió ningún aviso en estas fechas. El seguimiento se activa por sede en Ajustes › Presupuestos › Seguimiento automático.',
  loadError: 'No pudimos cargar el seguimiento automático.',
  loading: 'Cargando el seguimiento automático',
};

const copy = quoteFollowUpReportCopy;

type Row = QuoteFollowUpStepStats & { key: string };

function definitionText(definitions: readonly QuoteFollowUpDefinition[], key: QuoteFollowUpDefinition['key']): string | null {
  const def = definitions.find((d) => d.key === key);
  return def ? def.howItIsCalculated.join(' ') : null;
}

function Header({
  label,
  definitions,
  definition,
}: {
  label: string;
  definitions: readonly QuoteFollowUpDefinition[];
  definition: QuoteFollowUpDefinition['key'];
}) {
  const text = definitionText(definitions, definition);
  return (
    <span className="inline-flex items-center justify-end gap-0.5">
      {label}
      {text ? <HowCalculated column={label} text={text} /> : null}
    </span>
  );
}

/** Hay algo que contar: algún aviso enviado u omitido. */
export function hasFollowUpActivity(report: QuoteFollowUpReport): boolean {
  return report.total.sent > 0 || report.skipped.some((s) => s.count > 0);
}

/**
 * DX-561 · Reportes › Presupuestos: el bloque «Seguimiento automático», con
 * los mismos período y sede que el embudo (DX-558). Por aviso y en total:
 * enviados, abiertos, aceptados en los 14 días siguientes y la tasa; debajo,
 * los avisos que no salieron por motivo y «Cómo se calcula». Un 403 no pinta
 * nada (el embudo ya dice que el rol no tiene acceso).
 */
export function QuoteFollowUpReportSection({
  token,
  filters,
  fmt,
  providerFiltered = false,
}: {
  token: string;
  filters: QuoteFollowUpReportFilters;
  fmt: RegionalFormat;
  /** El embudo está filtrado por profesional: este bloque no lo admite y lo dice. */
  providerFiltered?: boolean;
}) {
  const [data, setData] = useState<QuoteFollowUpReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const filterKey = JSON.stringify(filters);

  useEffect(() => {
    const query = JSON.parse(filterKey) as QuoteFollowUpReportFilters;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await getQuoteFollowUpReport(token, query);
        if (cancelled) return;
        setData(res);
        setError(null);
        setForbidden(false);
      } catch (err) {
        if (cancelled) return;
        setForbidden(err instanceof ApiError && err.status === 403 && !query.locationId);
        setError(apiErrorMessage(err, { fallback: copy.loadError }));
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, filterKey, reloadKey]);

  if (forbidden) return null;

  const pct = (value: number | null) => (value === null ? copy.noValue : fmt.percent(value, 1));
  const defs = data?.definitions ?? [];
  const rows: Row[] = data
    ? [...data.steps.map((s) => ({ ...s, key: `step-${s.step}` })), { ...data.total, key: 'total' }]
    : [];
  const name = (r: Row) => (r.step === null ? copy.total : followUpStepLabel(r.step));

  const columns: DataListColumn<Row>[] = [
    {
      id: 'step',
      header: copy.colStep,
      mobile: 'primary',
      cell: (r) => <span className={r.step === null ? 'font-semibold text-ink' : 'text-ink'}>{name(r)}</span>,
    },
    {
      id: 'sent',
      header: <Header label={copy.colSent} definitions={defs} definition="sent" />,
      numeric: true,
      cell: (r) => <span data-testid={`follow-up-sent-${r.key}`}>{fmt.number(r.sent)}</span>,
    },
    {
      id: 'opened',
      header: <Header label={copy.colOpened} definitions={defs} definition="opened" />,
      numeric: true,
      cell: (r) => (
        <span className="flex flex-col items-end">
          <span>{fmt.number(r.opened)}</span>
          <span className="whitespace-nowrap text-xs text-muted">{copy.ofSent(pct(r.openRate))}</span>
        </span>
      ),
    },
    {
      id: 'accepted',
      header: (
        <Header
          label={copy.colAccepted(FOLLOW_UP_ACCEPTANCE_WINDOW_DAYS)}
          definitions={defs}
          definition="acceptedWithin14Days"
        />
      ),
      numeric: true,
      cell: (r) => fmt.number(r.acceptedWithin14Days),
    },
    {
      id: 'rate',
      header: <Header label={copy.colRate} definitions={defs} definition="acceptanceRate" />,
      numeric: true,
      cell: (r) => (
        <span data-testid={`follow-up-rate-${r.key}`} className="font-medium text-ink">
          {pct(r.acceptanceRate)}
        </span>
      ),
    },
  ];

  const skipped = (data?.skipped ?? []).filter((s) => s.count > 0);

  return (
    <section
      aria-labelledby="quote-follow-up-report-title"
      data-testid="quote-follow-up-report"
      className="flex min-w-0 flex-col gap-3 border-t border-border pt-6"
    >
      <div className="flex max-w-[80ch] flex-col gap-1">
        <h3 id="quote-follow-up-report-title" className="t-label text-ink">
          {copy.title}
        </h3>
        <p className="text-sm text-muted">{copy.caption(FOLLOW_UP_ACCEPTANCE_WINDOW_DAYS)}</p>
        {providerFiltered ? <p className="text-sm text-muted">{copy.providerIgnored}</p> : null}
      </div>

      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        isEmpty={!data || !hasFollowUpActivity(data)}
        emptyTitle={copy.empty}
        emptyDescription={copy.emptyHint}
        skeleton={<TableSkeleton rows={4} />}
      >
        {data ? (
          <div className="flex min-w-0 flex-col gap-4">
            <DataList label={copy.tableLabel} rows={rows} columns={columns} getRowKey={(r) => r.key} phone="scroll" />

            {skipped.length > 0 ? (
              <div className="flex max-w-[60ch] flex-col gap-2">
                <h4 className="text-sm font-medium text-ink">{copy.skippedTitle}</h4>
                <ul aria-label={copy.skippedLabel} className="flex flex-col divide-y divide-border-subtle text-sm">
                  {skipped.map((s) => (
                    <li
                      key={s.reason}
                      data-testid={`follow-up-skipped-${s.reason}`}
                      className="flex items-baseline justify-between gap-4 py-1.5"
                    >
                      <span className="min-w-0 text-ink first-letter:uppercase">
                        {FOLLOW_UP_REASON_LABELS[s.reason]?.short ?? s.reason}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted">{fmt.number(s.count)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {defs.length > 0 ? (
              <div className="-mx-2 max-w-[80ch] self-start" data-testid="quote-follow-up-how">
                <Disclosure summary={copy.howTitle}>
                  <dl className="flex flex-col gap-3 px-2 text-sm">
                    {defs.map((d) => (
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
    </section>
  );
}
