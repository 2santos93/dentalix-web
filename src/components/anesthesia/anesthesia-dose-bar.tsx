'use client';
import * as React from 'react';
import { AlertTriangle, Info, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  formatDecimal,
  formatEpinephrineMg,
  type AnesthesiaDoseSummary,
  type DoseRemaining,
  type EpinephrineSummary,
  type AnesthesiaDoseWindow,
  type AnesthesiaDoseWindowPart,
} from '@/lib/anesthesia/anesthesia-api';
import { sedeTime, type SedeClock } from '@/lib/locations/sede-clock';
import { wallDay } from '@/lib/time/wall-clock';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Callout } from '@/components/ui/callout';

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
  // DX-420: de dónde sale el máximo, cuánto queda y la epinefrina.
  maxLine: (maxMg: number, perKg: number) =>
    `Máximo ${formatDecimal(maxMg)} mg (${formatDecimal(perKg)} mg/kg)`,
  source: (source: string) => `Fuente: ${source}`,
  remaining: (r: DoseRemaining) =>
    `Quedan ${formatDecimal(r.mg)} mg ≈ ${formatDecimal(r.carpules)} ${r.carpules === 1 ? 'carpule' : 'carpules'} de ${formatDecimal(r.mlPerCarpule)} ml`,
  remainingByEpinephrine: (mg: number) =>
    `Limita la epinefrina: quedan ${formatEpinephrineMg(mg)} mg.`,
  epinephrineLabel: 'Epinefrina por cita',
  epinephrineValue: (e: EpinephrineSummary) =>
    `${formatEpinephrineMg(e.totalMg)} de ${formatEpinephrineMg(e.maxMg)} mg · ${e.percent} %`,
  epinephrineScope: (cardiac: boolean | null) =>
    cardiac === true
      ? 'Tope de 0,04 mg: cardiopatía en la anamnesis.'
      : cardiac === null
        ? 'Tope de adulto sano (0,2 mg): sin anamnesis no se sabe si es cardiópata.'
        : 'Tope de adulto sano (0,2 mg); con cardiopatía sería 0,04 mg.',
  epinephrineWarning: 'Epinefrina cerca del tope (80 % o más).',
  epinephrineExceeded: 'Tope de epinefrina alcanzado o superado: solo se guarda con un motivo.',
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

const toneClass = (level: string) =>
  level === 'EXCEEDED' ? 'bg-danger' : level === 'WARNING' ? 'bg-warning' : 'bg-success';

/**
 * DX-420: la epinefrina, que tiene su propio tope por cita (0,2 mg; 0,04 mg
 * en el cardiópata), junto a la barra del anestésico.
 */
function EpinephrineMeter({ epinephrine }: { epinephrine: EpinephrineSummary }) {
  const { level, percent } = epinephrine;
  const message =
    level === 'EXCEEDED'
      ? doseBarCopy.epinephrineExceeded
      : level === 'WARNING'
        ? doseBarCopy.epinephrineWarning
        : null;
  return (
    <div className="flex min-w-0 flex-col gap-1" data-epinephrine-level={level}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="t-caption text-ink">{doseBarCopy.epinephrineLabel}</span>
        <span className="text-xs tabular-nums text-ink">{doseBarCopy.epinephrineValue(epinephrine)}</span>
      </div>
      <div
        role="meter"
        aria-label={doseBarCopy.epinephrineLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(percent, 100)}
        aria-valuetext={doseBarCopy.epinephrineValue(epinephrine)}
        className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
      >
        <div className={cn('h-full rounded-full', toneClass(level))} style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
      <p className="text-xs text-muted">{doseBarCopy.epinephrineScope(epinephrine.cardiac)}</p>
      {message ? (
        <Callout
          tone={level === 'EXCEEDED' ? 'danger' : 'warning'}
          role={level === 'EXCEEDED' ? 'alert' : 'status'}
          icon={level === 'EXCEEDED' ? ShieldAlert : AlertTriangle}
          className="px-3 py-2"
        >
          {message}
        </Callout>
      ) : null}
    </div>
  );
}

function BarTitle({ id }: { id?: string }) {
  return (
    <h3 id={id} className="t-label text-ink">
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
 *
 * DX-420: con un anestésico, el máximo usado (pediátrico o reducido) con su
 * fuente y «quedan X mg ≈ Y carpules»; al lado, la barra de epinefrina.
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
  const single = byAnesthetic.length === 1 ? byAnesthetic[0] : null;
  const { remaining, epinephrine } = summary;

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
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1">
          {percent !== null ? (
            <div
              role="meter"
              aria-label={doseBarCopy.label}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.min(percent, 100)}
              aria-valuetext={doseBarCopy.ofMax(percent)}
              className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
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
          {single && single.maxMg !== null ? (
            <p className="text-xs tabular-nums text-ink">{doseBarCopy.maxLine(single.maxMg, single.maxMgPerKg)}</p>
          ) : null}
          {single ? <p className="break-words text-xs text-muted">{doseBarCopy.source(single.maxSource)}</p> : null}
          {remaining ? (
            <p className="text-sm font-medium tabular-nums text-ink">
              {doseBarCopy.remaining(remaining)}
              {remaining.limitedBy === 'EPINEPHRINE' ? (
                <span className="block text-xs font-normal text-muted">
                  {doseBarCopy.remainingByEpinephrine(remaining.epinephrineMg)}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
        <EpinephrineMeter epinephrine={epinephrine} />
      </div>
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
        // Callout del tono (DESIGN.md → Callout); el rol no cambia: bloqueo
        // anuncia (alert), aviso y falta de peso informan (status).
        <Callout
          tone={tone === 'danger' ? 'danger' : tone === 'warning' ? 'warning' : 'neutral'}
          role={level === 'EXCEEDED' ? 'alert' : 'status'}
          icon={Icon}
          className="px-3 py-2"
        >
          {message}
        </Callout>
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
      <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-danger-text">
        <ShieldAlert aria-hidden className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 break-words">{message}</span>
        <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
          {doseBarCopy.retry}
        </Button>
      </div>
    </BarFrame>
  );
}
