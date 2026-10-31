'use client';
import { useState } from 'react';
import Link from 'next/link';
import { presetRange } from '@/lib/payments/cash-period';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { moneyWithCode } from '@/lib/format/sede-number';
import { isWithinMonths, PRODUCTION_MAX_PERIOD_MONTHS } from '@/lib/reports/period-presets';
import { getProductionByProcedure } from '@/lib/reports/reports-api';
import { DateRangePicker } from '@/components/ui/date-picker';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { FormField } from '@/components/shared/form-field';
import { EmptyState } from '@/components/shared/empty-state';
import { InlineError } from '@/components/errors/inline-error';
import { SectionError } from '@/components/errors/section-error';
import { sectionLinkClass } from './today-section';
import { useLoad } from './use-load';

export const productionCopy = {
  heading: 'Tu producción del período',
  description: (from: string, to: string) => `Lo que marcaste como realizado del ${from} al ${to}, por moneda.`,
  link: 'Ver el detalle',
  periodLabel: 'Periodo',
  fromLabel: 'Desde',
  toLabel: 'Hasta',
  rangeInvalid: 'La fecha «Hasta» debe ser igual o posterior a la fecha «Desde».',
  rangeTooLong: `Elige como mucho ${PRODUCTION_MAX_PERIOD_MONTHS} meses.`,
  loading: 'Cargando tu producción…',
  error: 'No pudimos cargar tu producción.',
  emptyTitle: 'Sin producción en el período.',
  emptyDescription: 'Los tratamientos que marques como realizados aparecerán aquí.',
  net: 'Neto',
  gross: 'Bruto',
  discounts: 'Descuentos',
  procedures: (n: string, one: boolean) => (one ? `${n} procedimiento` : `${n} procedimientos`),
};
const copy = productionCopy;

/**
 * «Tu producción del período» del odontólogo (I1): `GET /reports/production-
 * by-procedure`, que la API ya acota a lo suyo (DX-423). Por moneda, sin
 * convertir; el detalle por procedimiento vive en Reportes.
 */
export function MyProductionSection({
  token,
  timeZone,
  scopeKey,
  fmt,
}: {
  token: string;
  timeZone: string;
  scopeKey: string;
  fmt: RegionalFormat | null;
}) {
  const defaults = { from: presetRange('month', timeZone).from, to: presetRange('today', timeZone).to };
  const [fromInput, setFrom] = useState<string | null>(null);
  const [toInput, setTo] = useState<string | null>(null);
  const from = fromInput ?? defaults.from;
  const to = toInput ?? defaults.to;
  const complete = from !== '' && to !== '';
  const rangeInvalid = complete && from > to;
  const tooLong = complete && !rangeInvalid && !isWithinMonths({ from, to }, PRODUCTION_MAX_PERIOD_MONTHS);
  const canQuery = complete && !rangeInvalid && !tooLong;
  const load = useLoad(() => getProductionByProcedure(token, { from, to }), `${from}|${to}|${scopeKey}`, canQuery, copy.error);
  const civil = (day: string) => (fmt ? fmt.civilDate(day) : day);

  return (
    <section aria-labelledby="inicio-production-title" className="flex flex-col gap-4">
      <SectionHeader
        titleId="inicio-production-title"
        title={copy.heading}
        description={canQuery ? copy.description(civil(from), civil(to)) : undefined}
        className="flex-row items-start justify-between"
        actions={
          <Link href="/reportes" className={sectionLinkClass}>
            {copy.link}
          </Link>
        }
      />
      <div className="flex">
      <FormField htmlFor="dashboard-production-period" label={copy.periodLabel} className="w-full sm:w-auto">
        <DateRangePicker
          id="dashboard-production-period"
          value={complete ? { from, to } : null}
          onChange={(range) => {
            setFrom(range?.from ?? '');
            setTo(range?.to ?? '');
          }}
          presets
          startLabel={copy.fromLabel}
          endLabel={copy.toLabel}
          isInvalid={rangeInvalid || tooLong}
          aria-describedby={rangeInvalid || tooLong ? 'dashboard-production-error' : undefined}
        />
      </FormField>
      </div>
      {rangeInvalid || tooLong ? (
        <InlineError id="dashboard-production-error">{rangeInvalid ? copy.rangeInvalid : copy.rangeTooLong}</InlineError>
      ) : !canQuery ? null : load.status === 'error' ? (
        <SectionError description={load.message} onRetry={load.reload} />
      ) : load.status !== 'ready' ? (
        <Skeleton role="status" aria-label={copy.loading} className="h-24 w-full rounded-xl" />
      ) : load.data.totals.length === 0 ? (
        <EmptyState role="status" title={copy.emptyTitle} description={copy.emptyDescription} />
      ) : (
        <ul className="divide-y divide-border-subtle overflow-hidden rounded-xl border border-border bg-surface">
          {load.data.totals.map((t) => {
            const money = (amount: number) => (fmt ? moneyWithCode(amount, t.currency, fmt) : `${t.currency} ${amount}`);
            const n = fmt ? fmt.number(t.count) : String(t.count);
            return (
              <li key={t.currency} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-baseline sm:justify-between sm:px-6" data-testid={`production-${t.currency}`}>
                <div className="flex flex-col gap-0.5">
                  <span className="t-overline">
                    {copy.net} · {t.currency}
                  </span>
                  <span className="t-data text-lg font-semibold text-ink">{money(t.net)}</span>
                  <span className="t-data text-xs text-muted">{copy.procedures(n, t.count === 1)}</span>
                </div>
                <dl className="flex gap-6 text-sm">
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-xs text-muted">{copy.gross}</dt>
                    <dd className="t-data text-ink">{money(t.gross)}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-xs text-muted">{copy.discounts}</dt>
                    <dd className="t-data text-ink">{money(t.discounts)}</dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
