'use client';
import * as React from 'react';
import { formatCurrency } from '@/lib/format/currency';
import { BUCKET_LABELS, BUCKET_ORDER } from '@/lib/receivables/presentation';
import type { AgingTotal } from '@/lib/receivables/receivables-api';
import { cn } from '@/lib/utils';

const copy = {
  title: 'Resumen por antigüedad',
  debtors: (n: number) => `${n} ${n === 1 ? 'deudor' : 'deudores'}`,
  debt: 'Por cobrar',
  credit: 'Saldo a favor',
  creditHint: 'Va aparte: no se resta de los tramos.',
};

/**
 * Los totales por tramo de cada moneda, sin convertir, como REGISTRO: una
 * sección con filete, una fila de cinco celdas por moneda (etiqueta arriba,
 * cifra tabular abajo). No son tarjetas de métrica sueltas: DESIGN.md prohíbe
 * el «número grande / etiqueta pequeña» como estructura. Son de TODAS las filas
 * filtradas, no de la página visible.
 */
export function AgingSummary({ totals }: { totals: AgingTotal[] }) {
  const headingId = React.useId();
  if (totals.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className="rounded-xl border border-border bg-surface">
      <h2 id={headingId} className="t-title border-b border-hairline px-4 py-3 text-ink sm:px-6">
        {copy.title}
      </h2>
      <div className="divide-y divide-hairline">
        {totals.map((total) => (
          <CurrencyTotals key={total.currency} total={total} />
        ))}
      </div>
    </section>
  );
}

function CurrencyTotals({ total }: { total: AgingTotal }) {
  const labelId = React.useId();
  return (
    <div className="px-4 py-3 sm:px-6" data-testid={`aging-total-${total.currency}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p id={labelId} className="text-sm text-muted">
          <span className="font-medium text-ink">{total.currency}</span>{' '}
          <span className="tabular-nums">· {copy.debtors(total.patients)}</span>
        </p>
        <p className="text-sm text-muted">
          {copy.debt}{' '}
          <span className="font-medium tabular-nums text-ink">
            {formatCurrency(total.debt, total.currency)}
          </span>
        </p>
      </div>
      <dl
        aria-labelledby={labelId}
        className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-5 sm:gap-0 sm:divide-x sm:divide-hairline"
      >
        {BUCKET_ORDER.map((bucket) => (
          <div key={bucket} className="min-w-0 sm:px-3 sm:first:pl-0">
            <dt className="t-label text-muted">{BUCKET_LABELS[bucket]}</dt>
            <dd
              className={cn(
                'truncate font-medium tabular-nums',
                bucket === 'over90' && total.buckets.over90 > 0 ? 'text-danger' : 'text-ink',
              )}
            >
              {formatCurrency(total.buckets[bucket], total.currency)}
            </dd>
          </div>
        ))}
      </dl>
      {total.credit > 0 ? (
        <p className="mt-2 text-xs text-muted">
          {copy.credit}{' '}
          <span className="font-medium tabular-nums text-success">
            {formatCurrency(total.credit, total.currency)}
          </span>
          {' · '}
          {copy.creditHint}
        </p>
      ) : null}
    </div>
  );
}
