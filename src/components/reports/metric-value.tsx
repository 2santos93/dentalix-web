'use client';
import * as React from 'react';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { formatChange, formatMetric, TREND_LABELS } from '@/lib/reports/comparison-table';
import type { KpiDefinition, Metric } from '@/lib/reports/reports-api';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { cn } from '@/lib/utils';
import { deltaBase } from './delta';

const copy = {
  // BE-045: el período comparado no tiene toda su producción atribuida.
  notCompared: '—',
  notComparedSr: (previous: string) =>
    `Sin comparar con ${previous}: el período comparado no tiene toda su producción atribuida a una sede.`,
  against: (trend: string, change: string, previous: string) => `${trend}: ${change} frente a ${previous}`,
  isNew: 'nuevo',
  isNewSr: (previous: string) => `Nuevo: en el período comparado fue ${previous}.`,
  lowBase: 'base baja',
  lowBaseSr: (direction: string, previous: string) =>
    `${direction} frente a ${previous}; la base del período comparado es demasiado baja para una variación fiable.`,
  up: 'Sube',
  down: 'Baja',
  same: 'Igual',
};

const TREND_CLASS = {
  BETTER: 'text-success-text',
  WORSE: 'text-danger-text',
  EQUAL: 'text-muted',
} as const;

/**
 * Un valor de la comparación (DX-014): el valor y, si se compara, la variación
 * con una flecha que dice hacia dónde se movió (arriba, abajo o igual) y un
 * color que dice si eso es bueno según el indicador (`trend`). El color nunca va
 * solo: la flecha y el signo dan la dirección, y el lector de pantalla oye
 * «Mejora: +20 % frente a 100.000,00 COP». Los indicadores que ya son un %
 * varían en puntos: «Empeora: +2 p.p. frente a 8 %».
 *
 * Cuando la variación no sería honesta no se pinta un porcentaje:
 * - la API marca la base como no fiable (`previousUnattributed`, BE-045): «—»
 *   en muted (la nota plegable y «Cómo se calcula» dicen por qué);
 * - antes era 0: «nuevo»; base demasiado pequeña: «base baja» (`deltaBase`,
 *   la regla compartida con Inicio). En muted, con la flecha de la dirección.
 */
export function MetricValue({
  unit,
  changeUnit,
  metric,
  currency,
  fmt,
  align = 'end',
  sample,
  strong = false,
}: {
  unit: KpiDefinition['unit'];
  changeUnit: KpiDefinition['changeUnit'];
  metric: Metric & { previousUnattributed?: true };
  currency?: string;
  /** DX-378: el formato de la sede (números, % y moneda). */
  fmt: RegionalFormat;
  align?: 'start' | 'end';
  /** Citas atendidas del período comparado, para los indicadores en puntos (ver `deltaBase`). */
  sample?: number | null;
  /** El valor en semibold (la fila «Total clínica»). */
  strong?: boolean;
}) {
  const value = formatMetric(unit, metric.value, fmt, currency);
  const { trend, previous, change } = metric;
  const showChange = trend !== null && previous !== null;
  const previousText = previous === null ? '' : formatMetric(unit, previous, fmt, currency);
  const up = metric.value !== null && previous !== null && metric.value > previous;
  const Icon = trend === 'EQUAL' ? Minus : up ? ArrowUp : ArrowDown;
  const base = showChange ? deltaBase(metric, { unit, changeUnit }, sample) : 'ok';
  const changeText = change === null ? null : formatChange(change, changeUnit, fmt);
  return (
    <span className={cn('flex flex-col gap-0.5', align === 'end' ? 'items-end text-right' : 'items-start')}>
      <span className={cn('whitespace-nowrap tabular-nums text-ink', strong ? 'font-semibold' : 'font-medium')}>{value}</span>
      {metric.previousUnattributed && previous !== null ? (
        <span data-testid="not-compared" className="whitespace-nowrap text-xs text-muted">
          <span aria-hidden>{copy.notCompared}</span>
          <span className="sr-only">{copy.notComparedSr(previousText)}</span>
        </span>
      ) : null}
      {showChange && base !== 'ok' ? (
        <span
          data-trend={trend}
          data-base={base}
          className="inline-flex items-center gap-0.5 whitespace-nowrap text-xs text-muted"
        >
          <Icon aria-hidden className="size-3.5 shrink-0" />
          <span aria-hidden>{base === 'new' ? copy.isNew : copy.lowBase}</span>
          <span className="sr-only">
            {base === 'new'
              ? copy.isNewSr(previousText)
              : copy.lowBaseSr(trend === 'EQUAL' ? copy.same : up ? copy.up : copy.down, previousText)}
          </span>
        </span>
      ) : showChange ? (
        <span
          data-trend={trend}
          className={cn('inline-flex items-center gap-0.5 whitespace-nowrap text-xs font-medium tabular-nums', TREND_CLASS[trend])}
        >
          <Icon aria-hidden className="size-3.5 shrink-0" />
          {/* Sin `change` (0 antes y ahora) no hay % que dar: «igual». */}
          <span aria-hidden>{changeText ?? copy.same.toLowerCase()}</span>
          <span className="sr-only">
            {copy.against(TREND_LABELS[trend], changeText ?? copy.same.toLowerCase(), previousText)}
          </span>
        </span>
      ) : null}
    </span>
  );
}
