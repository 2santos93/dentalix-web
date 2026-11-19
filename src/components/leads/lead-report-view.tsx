'use client';
import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChartColumn } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { civilDateInZone } from '@/lib/format/date';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { NO_SEDE_FORMAT } from '@/lib/format/sede-number';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { PERIOD_PRESETS } from '@/lib/reports/period-presets';
import {
  LEADS_HREF,
  LEAD_CHANNEL_LABELS,
  LEAD_REPORT_PERIODS,
  getLeadReport,
  leadReportRange,
  NO_OWNER,
  reportFigureHref,
  type LeadChannel,
  type LeadReached,
  type LeadReport,
  type LeadReportLine,
  type LeadReportPeriod,
} from '@/lib/leads/leads-api';
import { SectionError } from '@/components/errors/section-error';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { EmptyState } from '@/components/shared/empty-state';
import { TableSkeleton } from '@/components/shared/async-section';
import { PageHeader } from '@/components/shared/page-header';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { SectionHeader } from '@/components/ui/section-header';
import { SegmentedControl } from '@/components/ui/segmented-control';

export const leadReportCopy = {
  title: 'Informe de conversión',
  description:
    'De los prospectos dados de alta en el período, cuántos llegaron a tener cita y cuántos asistieron. Cada cifra abre la lista con esos mismos prospectos.',
  back: 'Prospectos',
  period: 'Período',
  byChannel: 'Por canal',
  byOwner: 'Por responsable',
  total: 'Total',
  noOwner: 'Sin responsable',
  colChannel: 'Canal',
  colOwner: 'Responsable',
  colLeads: 'Prospectos',
  colScheduled: 'Con cita',
  colScheduledRate: '% con cita',
  colAttended: 'Asistieron',
  colAttendedRate: '% asistió',
  colConversion: 'Conversión',
  figureLabel: (n: number, what: string, row: string) => `${row}, ${what}: ${n}. Ver en la lista`,
  emptyTitle: 'Sin prospectos en el período',
  emptyDescription: 'Elige otro período o da de alta prospectos desde la bandeja.',
  openLeads: 'Ir a Prospectos',
  loadError: 'No pudimos cargar el informe de conversión.',
};
const copy = leadReportCopy;

const PERIOD_OPTIONS = LEAD_REPORT_PERIODS.map((key) => ({
  value: key,
  label: PERIOD_PRESETS.find((p) => p.key === key)?.label ?? key,
}));

type Row = LeadReportLine & {
  rowLabel: string;
  channel: LeadChannel | null;
  ownerId: string | null;
  linkable: boolean;
};

function rate(value: number, fmt: RegionalFormat | null): string {
  return fmt ? fmt.percent(value * 100, 1) : NO_SEDE_FORMAT;
}

/**
 * Informe de conversión de los prospectos (DX-556): por canal y por
 * responsable, prospectos → con cita → asistieron, con la tasa de cada paso.
 * Período en la zona de la sede ([desde, hasta) en instantes). Cada cifra
 * enlaza a la lista con los mismos filtros (`reached`), así que cuadran.
 */
export function LeadReportView({ token }: { token: string }) {
  const stamp = useSedeStamp(token);
  const [period, setPeriod] = useState<LeadReportPeriod>('this_month');
  const [report, setReport] = useState<LeadReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const timeZone = stamp.clock?.timeZone ?? null;

  const range = useMemo(() => {
    if (!timeZone) return null;
    const today = civilDateInZone(new Date(), timeZone);
    return today ? leadReportRange(period, today, timeZone) : null;
  }, [period, timeZone]);

  useEffect(() => {
    if (!range) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await getLeadReport(token, range!);
        if (cancelled) return;
        setReport(res);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setReport(null);
        setError(apiErrorMessage(err, { fallback: copy.loadError }));
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, range, reloadKey]);

  const fmt = stamp.fmt;

  function figure(row: Row, value: number, reached: LeadReached | null, what: string) {
    const text = fmt ? fmt.number(value) : String(value);
    if (!range || !row.linkable || value === 0) return <span className="tabular-nums">{text}</span>;
    return (
      <Link
        href={reportFigureHref(range, { channel: row.channel, ownerId: row.ownerId }, reached)}
        aria-label={copy.figureLabel(value, what, row.rowLabel)}
        className="relative z-10 tabular-nums text-primary-text underline-offset-4 hover:underline"
      >
        {text}
      </Link>
    );
  }

  const columns = (first: string): DataListColumn<Row>[] => [
    { id: 'row', header: first, mobile: 'primary', cell: (r) => r.rowLabel },
    {
      id: 'leads',
      header: copy.colLeads,
      align: 'end',
      cell: (r) => figure(r, r.leads, null, copy.colLeads.toLowerCase()),
    },
    {
      id: 'scheduled',
      header: copy.colScheduled,
      align: 'end',
      cell: (r) => figure(r, r.scheduled, 'SCHEDULED', copy.colScheduled.toLowerCase()),
    },
    {
      id: 'scheduledRate',
      header: copy.colScheduledRate,
      align: 'end',
      cell: (r) => <span className="tabular-nums">{rate(r.scheduledRate, fmt)}</span>,
    },
    {
      id: 'attended',
      header: copy.colAttended,
      align: 'end',
      cell: (r) => figure(r, r.attended, 'ATTENDED', copy.colAttended.toLowerCase()),
    },
    {
      id: 'attendedRate',
      header: copy.colAttendedRate,
      align: 'end',
      cell: (r) => <span className="tabular-nums">{rate(r.attendedRate, fmt)}</span>,
    },
    {
      id: 'conversion',
      header: copy.colConversion,
      align: 'end',
      cell: (r) => <span className="tabular-nums font-medium">{rate(r.conversionRate, fmt)}</span>,
    },
  ];

  const total: Row | null = report
    ? { ...report.totals, rowLabel: copy.total, channel: null, ownerId: null, linkable: true }
    : null;
  const byChannel: Row[] = report
    ? report.byChannel.map((l) => ({
        ...l,
        rowLabel: LEAD_CHANNEL_LABELS[l.key as LeadChannel] ?? l.key ?? copy.total,
        channel: l.key as LeadChannel,
        ownerId: null,
        linkable: Boolean(l.key),
      }))
    : [];
  const byOwner: Row[] = report
    ? report.byOwner.map((l) => ({
        ...l,
        rowLabel: l.key ? (l.label ?? copy.noOwner) : copy.noOwner,
        channel: null,
        ownerId: l.key ?? NO_OWNER,
        linkable: true,
      }))
    : [];

  return (
    <>
      <PageHeader title={copy.title} description={copy.description} back={{ href: LEADS_HREF, label: copy.back }} />
      <div className="flex flex-col gap-6">
        <SegmentedControl
          aria-label={copy.period}
          value={period}
          onValueChange={setPeriod}
          options={PERIOD_OPTIONS}
          fullWidthOnMobile
          className="sm:self-start"
        />
        <SedeStampNote stamp={stamp} />
        {error && !report ? (
          <SectionError description={error} onRetry={() => setReloadKey((k) => k + 1)} />
        ) : !report || !total ? (
          <TableSkeleton rows={4} />
        ) : total.leads === 0 ? (
          <EmptyState
            role="status"
            icon={<ChartColumn aria-hidden />}
            title={copy.emptyTitle}
            description={copy.emptyDescription}
            action={
              <Link href={LEADS_HREF} className="text-sm text-primary-text underline-offset-4 hover:underline">
                {copy.openLeads}
              </Link>
            }
          />
        ) : (
          <div aria-busy={loading} className="flex flex-col gap-8">
            <section aria-labelledby="lead-report-channel" className="flex flex-col gap-3">
              <SectionHeader title={copy.byChannel} titleId="lead-report-channel" />
              <DataList
                label={copy.byChannel}
                rows={[...byChannel, total]}
                columns={columns(copy.colChannel)}
                getRowKey={(r) => `c:${r.channel ?? 'total'}`}
                phone="scroll"
              />
            </section>
            <section aria-labelledby="lead-report-owner" className="flex flex-col gap-3">
              <SectionHeader
                title={copy.byOwner}
                titleId="lead-report-owner"
              />
              <DataList
                label={copy.byOwner}
                rows={[...byOwner, total]}
                columns={columns(copy.colOwner)}
                getRowKey={(r) => `o:${r === total ? 'total' : (r.ownerId ?? 'none')}`}
                phone="scroll"
              />
            </section>
          </div>
        )}
      </div>
    </>
  );
}
