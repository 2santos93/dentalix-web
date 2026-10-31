'use client';
import * as React from 'react';
import { AlertTriangle, Info, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  formatDecimal,
  type AnesthesiaDoseSummary,
  type AnesthesiaDoseWindow,
  type AnesthesiaDoseWindowPart,
} from '@/lib/anesthesia/anesthesia-api';
import { sedeTime, type SedeClock } from '@/lib/locations/sede-clock';
import { wallDay } from '@/lib/time/wall-clock';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export const doseBarCopy = {
  // DX-418: el acumulado es del paciente en una ventana móvil de 24 h (todas
  // sus evoluciones y sedes), no de la evolución.
  label: 'Acumulado del paciente en las últimas 24 h',
  scope: 'Suma todas sus evoluciones y sedes de la clínica, sea quien sea el profesional.',
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
  breakdown: 'Desglose por evolución y profesional',
  thisEntry: 'Esta evolución',
  otherEntry: 'Otra evolución',
  unknownAuthor: 'Profesional sin nombre',
  yesterday: 'ayer',
  partDose: (carpules: number, mg: number, percent: number | null) =>
    `${formatDecimal(carpules)} carp. · ${formatDecimal(mg)} mg${percent === null ? '' : ` (${percent} %)`}`,
  pending: (mg: number) => `Esta dosis, sin guardar: ${formatDecimal(mg)} mg`,
  loading: 'Calculando la dosis…',
  retry: 'Reintentar',
};

/** «10:30» o «ayer 18:05» en la zona de la sede (la ventana abarca dos días). */
function partTime(iso: string, clock: SedeClock | null): string | null {
  if (!clock) return null;
  const time = sedeTime(iso, clock);
  return wallDay(iso, clock.timeZone) === wallDay(new Date(), clock.timeZone)
    ? time
    : `${doseBarCopy.yesterday} ${time}`;
}

function partTitle(part: AnesthesiaDoseWindowPart, clock: SedeClock | null): string {
  const time = partTime(part.firstAdministeredAt, clock);
  return [
    part.current ? doseBarCopy.thisEntry : doseBarCopy.otherEntry,
    part.authorName ?? doseBarCopy.unknownAuthor,
    part.locationName,
    time,
  ]
    .filter(Boolean)
    .join(' · ');
}

function BarFrame({
  id,
  level,
  children,
}: {
  id?: string;
  level?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      data-level={level}
      className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-surface p-3"
    >
      {children}
    </section>
  );
}

function BarTitle({ id }: { id?: string }) {
  return (
    <h3 id={id} className="text-sm font-medium text-ink">
      {doseBarCopy.label}
    </h3>
  );
}

interface AnesthesiaDoseBarProps {
  summary: AnesthesiaDoseSummary;
  /** DX-418: desglose de la ventana; sin él solo se pinta el total. */
  window?: AnesthesiaDoseWindow | null;
  /** Reloj de la sede para la hora de cada parte; sin él, sin hora. */
  clock?: SedeClock | null;
  /** Id del título, para que el modal lo cite. */
  id?: string;
}

/**
 * Barra de mg acumulados frente al máximo por peso (DX-307). El cálculo es del
 * servidor: aquí solo se pinta. Aviso desde el 80 % y bloqueo desde el 100 %;
 * sin peso, lo dice en vez de inventar un máximo.
 *
 * DX-418: es el acumulado del PACIENTE en las últimas 24 h, con el desglose
 * por evolución y profesional (y la sede, que también cuenta) para que quien
 * la aplica vea lo que el paciente ya recibió, lo pusiera quien lo pusiera.
 */
export function AnesthesiaDoseBar({ summary, window, clock = null, id }: AnesthesiaDoseBarProps) {
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
  const parts = window?.parts ?? [];
  const pendingMg = window?.pendingMg ?? null;

  return (
    <BarFrame id={id} level={level}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <BarTitle id={id} />
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
      {window ? <p className="text-xs text-muted">{doseBarCopy.scope}</p> : null}
      {parts.length > 0 || pendingMg !== null ? (
        <ul aria-label={doseBarCopy.breakdown} className="flex flex-col gap-1 text-xs">
          {parts.map((part) => (
            <li
              key={`${part.clinicalEntryId}|${part.authorId}`}
              className="flex min-w-0 flex-col gap-x-2 sm:flex-row sm:items-baseline sm:justify-between"
            >
              <span className={cn('min-w-0 break-words', part.current ? 'font-medium text-ink' : 'text-ink')}>
                {partTitle(part, clock)}
              </span>
              <span className="shrink-0 tabular-nums text-muted">
                {doseBarCopy.partDose(part.carpules, part.mg, part.percent)}
              </span>
            </li>
          ))}
          {pendingMg !== null ? (
            <li className="tabular-nums text-muted">{doseBarCopy.pending(pendingMg)}</li>
          ) : null}
        </ul>
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
    </BarFrame>
  );
}

/** La barra mientras el servidor calcula el acumulado: mismo sitio, sin saltos. */
export function AnesthesiaDoseBarLoading({ id }: { id?: string }) {
  return (
    <BarFrame id={id}>
      <BarTitle id={id} />
      <Skeleton className="h-2 w-full rounded-full" />
      <p role="status" className="text-sm text-muted">
        {doseBarCopy.loading}
      </p>
    </BarFrame>
  );
}

/**
 * La barra cuando el cálculo falla: sin acumulado no hay barra que enseñar,
 * así que lo dice en su sitio con un reintento (no se puede guardar a ciegas:
 * el servidor recalcula y bloquea igual).
 */
export function AnesthesiaDoseBarError({
  id,
  message,
  onRetry,
}: {
  id?: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <BarFrame id={id}>
      <BarTitle id={id} />
      <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-danger">
        <ShieldAlert aria-hidden className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 break-words">{message}</span>
        <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
          {doseBarCopy.retry}
        </Button>
      </div>
    </BarFrame>
  );
}
