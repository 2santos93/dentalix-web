'use client';
import * as React from 'react';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { formatChange, formatMetric, TREND_LABELS } from '@/lib/reports/comparison-table';
import type { KpiDefinition, Metric } from '@/lib/reports/reports-api';
import { cn } from '@/lib/utils';

const copy = {
  previous: (value: string) => `antes ${value}`,
  against: (trend: string, change: string, previous: string) => `${trend}: ${change} frente a ${previous}`,
  againstNoBase: (trend: string, previous: string) => `${trend} frente a ${previous}`,
};

const TREND_CLASS = {
  BETTER: 'text-success',
  WORSE: 'text-danger',
  EQUAL: 'text-muted',
} as const;

/**
 * Un valor de la comparación (DX-014): el valor y, si se compara, la variación
 * con una flecha que dice hacia dónde se movió (arriba, abajo o igual) y un
 * color que dice si eso es bueno según el indicador (`trend`). El color nunca va
 * solo: la flecha y el signo dan la dirección, y el lector de pantalla oye
 * «Mejora: +20 % frente a 100.000,00 COP».
 */
export function MetricValue({
  unit,
  metric,
  currency,
  align = 'end',
}: {
  unit: KpiDefinition['unit'];
  metric: Metric;
  currency?: string;
  align?: 'start' | 'end';
}) {
  const value = formatMetric(unit, metric.value, currency);
  const { trend, previous, changePercent } = metric;
  const showChange = trend !== null && previous !== null;
  const previousText = previous === null ? '' : formatMetric(unit, previous, currency);
  const up = metric.value !== null && previous !== null && metric.value > previous;
  const Icon = trend === 'EQUAL' ? Minus : up ? ArrowUp : ArrowDown;
  return (
    <span className={cn('flex flex-col gap-0.5', align === 'end' ? 'items-end text-right' : 'items-start')}>
      <span className="whitespace-nowrap font-medium tabular-nums text-ink">{value}</span>
      {showChange ? (
        <span
          data-trend={trend}
          className={cn('inline-flex items-center gap-0.5 whitespace-nowrap text-xs font-medium tabular-nums', TREND_CLASS[trend])}
        >
          <Icon aria-hidden className="size-3.5 shrink-0" />
          <span aria-hidden>{changePercent !== null ? formatChange(changePercent) : copy.previous(previousText)}</span>
          <span className="sr-only">
            {changePercent !== null
              ? copy.against(TREND_LABELS[trend], formatChange(changePercent), previousText)
              : copy.againstNoBase(TREND_LABELS[trend], previousText)}
          </span>
        </span>
      ) : null}
    </span>
  );
}
