'use client';
import Link from 'next/link';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { moneyWithCode } from '@/lib/format/sede-number';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { SectionError } from '@/components/errors/section-error';
import { getReceivablesSummary, overdueOf, type AgingBuckets, type AgingTotal } from './inicio-api';
import { sectionLinkClass } from './today-section';
import { useLoad } from './use-load';

export const agingCopy = {
  heading: 'Cartera por antigüedad',
  asOf: (day: string) => `Al ${day}. Por moneda, sin convertir; el saldo a favor no se resta.`,
  link: 'Ver cartera',
  loading: 'Cargando la cartera…',
  error: 'No pudimos cargar la cartera.',
  emptyTitle: 'Nadie debe.',
  emptyDescription: 'Cuando un paciente tenga saldo pendiente, aparecerá aquí por antigüedad.',
  debt: 'Por cobrar',
  overdue: 'Vencido',
  credit: 'A favor',
  patients: (n: string, one: boolean) => (one ? `${n} paciente` : `${n} pacientes`),
  barLabel: (currency: string) => `Reparto por antigüedad de lo que se debe en ${currency}`,
  buckets: {
    current: 'Por vencer',
    days0to30: '0–30 días',
    days31to60: '31–60 días',
    days61to90: '61–90 días',
    over90: 'Más de 90 días',
  } satisfies Record<keyof AgingBuckets, string>,
};
const copy = agingCopy;

const ORDER: (keyof AgingBuckets)[] = ['current', 'days0to30', 'days31to60', 'days61to90', 'over90'];

/**
 * Rampa secuencial de un solo tono (más vieja = más tinta). Sale de la tinta y
 * la superficie del tema, así funciona en claro, en oscuro y con cualquier
 * acento: no gasta el acento ni los tonos de estado en una serie (skill
 * dataviz: «sequential = one hue»).
 */
const SHADE: Record<keyof AgingBuckets, number> = {
  current: 22,
  days0to30: 40,
  days31to60: 58,
  days61to90: 76,
  over90: 94,
};
const shade = (key: keyof AgingBuckets) =>
  `color-mix(in oklab, var(--color-ink) ${SHADE[key]}%, var(--color-surface))`;

/**
 * La cartera por antigüedad de ADMIN (I1), de `GET /receivables/aging/summary`
 * (solo totales, sin pacientes). Una barra segmentada fina por moneda —parte
 * de un todo leído junto a sus cifras— y los cinco tramos con su importe.
 */
export function AgingSection({ token, scopeKey, fmt }: { token: string; scopeKey: string; fmt: RegionalFormat | null }) {
  const load = useLoad(() => getReceivablesSummary(token), scopeKey, true, copy.error);
  return (
    <section aria-labelledby="inicio-aging-title" className="flex flex-col gap-3">
      <SectionHeader
        titleId="inicio-aging-title"
        title={copy.heading}
        description={load.status === 'ready' ? copy.asOf(fmt ? fmt.civilDate(load.data.asOf) : load.data.asOf) : undefined}
        className="flex-row items-start justify-between"
        actions={
          <Link href="/caja/cartera" className={sectionLinkClass}>
            {copy.link}
          </Link>
        }
      />
      {load.status === 'error' ? (
        <SectionError description={load.message} onRetry={load.reload} />
      ) : load.status !== 'ready' ? (
        <Skeleton role="status" aria-label={copy.loading} className="h-36 w-full rounded-xl" />
      ) : load.data.totals.length === 0 ? (
        <EmptyState role="status" title={copy.emptyTitle} description={copy.emptyDescription} />
      ) : (
        <ul className="divide-y divide-border-subtle overflow-hidden rounded-xl border border-border bg-surface">
          {load.data.totals.map((total) => (
            <AgingCurrency key={total.currency} total={total} fmt={fmt} />
          ))}
        </ul>
      )}
    </section>
  );
}

function AgingCurrency({ total, fmt }: { total: AgingTotal; fmt: RegionalFormat | null }) {
  const money = (amount: number) => (fmt ? moneyWithCode(amount, total.currency, fmt) : `${total.currency} ${amount}`);
  const debt = ORDER.reduce((sum, key) => sum + total.buckets[key], 0);
  const n = fmt ? fmt.number(total.patients) : String(total.patients);
  return (
    <li className="flex flex-col gap-4 p-4 sm:px-6" data-testid={`aging-${total.currency}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="text-sm text-muted">
          <span className="font-semibold text-ink">{total.currency}</span>
          {' · '}
          <span className="t-data">{copy.patients(n, total.patients === 1)}</span>
        </p>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div className="flex items-baseline gap-2">
            <dt className="text-muted">{copy.debt}</dt>
            <dd className="t-data font-semibold text-ink">{money(total.debt)}</dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-muted">{copy.overdue}</dt>
            <dd className="t-data font-semibold text-ink">{money(overdueOf(total))}</dd>
          </div>
          {total.credit > 0 ? (
            <div className="flex items-baseline gap-2">
              <dt className="text-muted">{copy.credit}</dt>
              <dd className="t-data font-semibold text-ink">{money(total.credit)}</dd>
            </div>
          ) : null}
        </dl>
      </div>
      {debt > 0 ? (
        // Barra fina, sin texto: las cifras de debajo la leen. 2px de superficie entre tramos.
        <div role="img" aria-label={copy.barLabel(total.currency)} className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full">
          {ORDER.filter((key) => total.buckets[key] > 0).map((key) => (
            <span
              key={key}
              className="h-full first:rounded-l-full last:rounded-r-full"
              style={{ width: `${(total.buckets[key] / debt) * 100}%`, background: shade(key) }}
            />
          ))}
        </div>
      ) : null}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-5">
        {ORDER.map((key) => (
          <div key={key} className="flex min-w-0 flex-col gap-0.5">
            <dt className="flex items-center gap-1.5 text-xs text-muted">
              <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: shade(key) }} />
              {copy.buckets[key]}
            </dt>
            <dd className="t-data text-sm font-medium text-ink">{money(total.buckets[key])}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}
