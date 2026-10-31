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
 * sección con filete, una fila por moneda (etiqueta arriba, cifra tabular
 * abajo). No son tarjetas de métrica sueltas: DESIGN.md prohíbe el «número
 * grande / etiqueta pequeña» como estructura. Son de TODAS las filas
 * filtradas, no de la página visible.
 *
 * Una moneda sin nada por cobrar (solo saldo a favor) no pinta cinco tramos a
 * cero; en el teléfono, los tramos a cero tampoco salen (crítica ops §5).
 */
export function AgingSummary({ totals }: { totals: AgingTotal[] }) {
  const headingId = React.useId();
  if (totals.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className="rounded-xl border border-border bg-surface">
      <h2 id={headingId} className="t-title border-b border-border-subtle px-4 py-3 text-ink sm:px-6">
        {copy.title}
      </h2>
      <div className="divide-y divide-border-subtle">
        {totals.map((total) => (
          <CurrencyTotals key={total.currency} total={total} />
        ))}
      </div>
    </section>
  );
}

function CurrencyTotals({ total }: { total: AgingTotal }) {
  const labelId = React.useId();
  const hasBuckets = BUCKET_ORDER.some((bucket) => total.buckets[bucket] > 0);
  return (
    <div className="px-4 py-3 sm:px-6" data-testid={`aging-total-${total.currency}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p id={labelId} className="text-sm text-muted">
          <span className="font-medium text-ink">{total.currency}</span>{' '}
          <span className="tabular-nums">· {copy.debtors(total.patients)}</span>
        </p>
        <p className="text-sm text-muted">
          {copy.debt}{' '}
          <span className="font-medium tabular-nums text-ink">{formatCurrency(total.debt, total.currency)}</span>
        </p>
      </div>
      {hasBuckets ? (
        <dl
          aria-labelledby={labelId}
          className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 sm:grid-cols-5 sm:gap-0 sm:divide-x sm:divide-border-subtle"
        >
          {BUCKET_ORDER.map((bucket) => {
            const amount = total.buckets[bucket];
            return (
              <div
                key={bucket}
                className={cn('contents min-w-0 sm:block sm:px-3 sm:first:pl-0', amount === 0 && 'max-sm:hidden')}
              >
                <dt className="t-label text-muted">{BUCKET_LABELS[bucket]}</dt>
                <dd
                  className={cn(
                    'text-right font-medium tabular-nums sm:truncate sm:text-left',
                    bucket === 'over90' && amount > 0 ? 'text-danger-text' : 'text-ink',
                  )}
                >
                  {formatCurrency(amount, total.currency)}
                </dd>
              </div>
            );
          })}
        </dl>
      ) : null}
      {total.credit > 0 ? (
        <p className="mt-2 text-xs text-muted">
          {copy.credit}{' '}
          <span className="font-medium tabular-nums text-success-text">
            {formatCurrency(total.credit, total.currency)}
          </span>
          {' · '}
          {copy.creditHint}
        </p>
      ) : null}
    </div>
  );
}
