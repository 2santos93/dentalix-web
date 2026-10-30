'use client';
import * as React from 'react';
import { AlertTriangle, Info, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDecimal, type AnesthesiaDoseSummary } from '@/lib/anesthesia/anesthesia-api';

export const doseBarCopy = {
  label: 'Dosis acumulada en la evolución',
  ofMax: (percent: number) => `${percent} % del máximo`,
  mg: (mg: number) => `${formatDecimal(mg)} mg`,
  noWeight: 'Dosis máxima no calculada: falta el peso.',
  warning: 'Cerca de la dosis máxima (80 % o más).',
  exceeded: 'Dosis máxima alcanzada o superada: solo se guarda con un motivo.',
  sum: 'Con varios anestésicos el % es la suma de las fracciones del máximo de cada uno.',
  row: (name: string, carpules: number, mg: number, maxMg: number | null, percent: number | null) =>
    maxMg === null || percent === null
      ? `${name}: ${formatDecimal(carpules)} carp. · ${formatDecimal(mg)} mg`
      : `${name}: ${formatDecimal(carpules)} carp. · ${formatDecimal(mg)} de ${formatDecimal(maxMg)} mg (${percent} %)`,
};

interface AnesthesiaDoseBarProps {
  summary: AnesthesiaDoseSummary;
  /** Id del título, para que el modal lo cite. */
  id?: string;
}

/**
 * Barra de mg acumulados frente al máximo por peso (DX-307). El cálculo es del
 * servidor: aquí solo se pinta. Aviso desde el 80 % y bloqueo desde el 100 %;
 * sin peso, lo dice en vez de inventar un máximo.
 */
export function AnesthesiaDoseBar({ summary, id }: AnesthesiaDoseBarProps) {
  const { percent, level, byAnesthetic, weightKg } = summary;
  const width = percent === null ? 0 : Math.min(percent, 100);
  const tone =
    level === 'EXCEEDED' ? 'danger' : level === 'WARNING' ? 'warning' : level === 'NO_WEIGHT' ? 'muted' : 'ok';
  const message =
    level === 'EXCEEDED'
      ? doseBarCopy.exceeded
      : level === 'WARNING'
        ? doseBarCopy.warning
        : level === 'NO_WEIGHT'
          ? doseBarCopy.noWeight
          : null;
  const Icon = level === 'EXCEEDED' ? ShieldAlert : level === 'WARNING' ? AlertTriangle : Info;

  return (
    <section
      aria-labelledby={id}
      data-level={level}
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 id={id} className="text-sm font-medium text-ink">
          {doseBarCopy.label}
        </h3>
        <p className="text-sm font-medium tabular-nums text-ink">
          {doseBarCopy.mg(summary.totalMg)}
          {percent !== null ? ` · ${doseBarCopy.ofMax(percent)}` : null}
          {weightKg !== null ? (
            <span className="font-normal text-muted"> · {formatDecimal(weightKg)} kg</span>
          ) : null}
        </p>
      </div>
      {percent !== null ? (
        <div
          role="meter"
          aria-label={doseBarCopy.label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(percent, 100)}
          aria-valuetext={doseBarCopy.ofMax(percent)}
          className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
        >
          <div
            className={cn(
              'h-full rounded-full',
              tone === 'danger' && 'bg-danger',
              tone === 'warning' && 'bg-warning',
              tone === 'ok' && 'bg-success',
            )}
            style={{ width: `${width}%` }}
          />
        </div>
      ) : null}
      {byAnesthetic.length > 1 ? (
        <ul className="flex flex-col gap-0.5 text-xs tabular-nums text-muted">
          {byAnesthetic.map((a) => (
            <li key={a.name}>{doseBarCopy.row(a.name, a.carpules, a.mg, a.maxMg, a.percent)}</li>
          ))}
          <li>{doseBarCopy.sum}</li>
        </ul>
      ) : null}
      {message ? (
        <p
          role={level === 'EXCEEDED' ? 'alert' : 'status'}
          className={cn(
            'flex items-start gap-2 text-sm',
            tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-ink',
          )}
        >
          <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{message}</span>
        </p>
      ) : null}
    </section>
  );
}
