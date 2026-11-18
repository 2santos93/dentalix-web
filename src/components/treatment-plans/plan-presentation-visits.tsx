import * as React from 'react';
import { SURFACE_LABELS } from '@/lib/odontogram/surface-labels';
import {
  modeShowsMoney,
  modeShowsTeeth,
  type PlanPresentationModel,
  type PresentationLine,
  type PresentationMode,
  type PresentationVisit,
} from '@/lib/treatment-plans/plan-presentation';
import { CompactOdontogram } from '@/components/odontogram/compact-odontogram';
import { cn } from '@/lib/utils';

export const presentationVisitsCopy = {
  visit: (n: number) => `Visita ${n}`,
  interval: (days: number) => (days === 1 ? 'Al menos 1 día después de la anterior' : `Al menos ${days} días después de la anterior`),
  proceduresOf: (n: number) => `Procedimientos de la visita ${n}`,
  tooth: (n: string) => `Diente ${n}`,
  visitTotal: 'Total de la visita',
  planTotal: (currency: string) => `Total del plan (${currency})`,
  totalsLabel: 'Total del plan',
  empty: 'Este plan todavía no tiene procedimientos.',
};

const copy = presentationVisitsCopy;

/** Clases por tono: `app` con los tokens del tema; `paper` en tinta fija (públicas e impreso). */
const TONES = {
  app: {
    card: 'border-border bg-surface',
    ink: 'text-ink',
    muted: 'text-muted',
    rule: 'border-border-subtle',
    strong: 'border-ink',
  },
  paper: {
    card: 'border-[#d1d5db] bg-white',
    ink: 'text-[#111827]',
    muted: 'text-[#4b5563]',
    rule: 'border-[#e5e7eb]',
    strong: 'border-[#111827]',
  },
} as const;

export type PresentationTone = keyof typeof TONES;

/** El total orientativo en la segunda moneda, ya pintado (fuera de la vista Clínica). */
export interface PresentationSecondTotal {
  label: string;
  amount: string;
  note: string;
}

interface PlanPresentationVisitsProps {
  model: PlanPresentationModel;
  mode: PresentationMode;
  /** Importe en la moneda del plan, con el formato de la sede. */
  money: (amount: number) => string;
  tone?: PresentationTone;
  secondTotal?: PresentationSecondTotal | null;
  /** Nivel del título de cada visita (h2 en la pantalla, h3 dentro de la página pública). */
  headingLevel?: 2 | 3;
  /** `false`: el total del plan lo pinta quien lo usa (la página pública, con su desglose). */
  showPlanTotal?: boolean;
}

function toothLine(line: PresentationLine): string | null {
  if (!line.toothNumber) return null;
  const surfaces = line.surfaces.map((s) => SURFACE_LABELS[s]).join(', ');
  return surfaces ? `${copy.tooth(line.toothNumber)} · ${surfaces}` : copy.tooth(line.toothNumber);
}

function visitTitle(visit: PresentationVisit): string {
  return visit.label ? `${copy.visit(visit.visit)} · ${visit.label}` : copy.visit(visit.visit);
}

/**
 * DX-560 · Las visitas del plan como se presentan al paciente: cada una con su
 * odontograma compacto, sus procedimientos (el texto para el paciente con su
 * `lang`, siempre texto plano), diente y caras, importes y total; al final el
 * total del plan y, si lo hay, el orientativo en la segunda moneda.
 *
 * - Completa: todo.
 * - Clínica: sin ningún importe (ni totales ni segunda moneda).
 * - Económica: sin dientes, caras ni odontograma.
 */
export function PlanPresentationVisits({
  model,
  mode,
  money,
  tone = 'app',
  secondTotal = null,
  headingLevel = 2,
  showPlanTotal = true,
}: PlanPresentationVisitsProps) {
  const t = TONES[tone];
  const showMoney = modeShowsMoney(mode);
  const showTeeth = modeShowsTeeth(mode);
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const baseId = React.useId();

  if (model.visits.length === 0) {
    return <p className={cn('text-sm', t.muted)}>{copy.empty}</p>;
  }

  return (
    <div className="presentation-visits flex min-w-0 flex-col gap-4" data-mode={mode}>
      {model.visits.map((visit) => {
        const headingId = `${baseId}-visit-${visit.visit}`;
        const drawTeeth = showTeeth && visit.teeth.length > 0;
        return (
          <section
            key={visit.visit}
            aria-labelledby={headingId}
            data-testid={`presentation-visit-${visit.visit}`}
            className={cn(
              'presentation-visit flex min-w-0 flex-col gap-3 rounded-lg border p-4 break-inside-avoid sm:p-5',
              t.card,
            )}
          >
            <header className="flex min-w-0 flex-col gap-0.5">
              <Heading id={headingId} className={cn('text-base font-semibold break-words', t.ink)}>
                {visitTitle(visit)}
              </Heading>
              {visit.minDaysAfterPrevious > 0 ? (
                <p className={cn('text-xs tabular-nums', t.muted)}>{copy.interval(visit.minDaysAfterPrevious)}</p>
              ) : null}
            </header>
            <div className={cn('flex min-w-0 flex-col gap-4', drawTeeth && 'md:flex-row md:items-start')}>
              {drawTeeth ? (
                <CompactOdontogram teeth={visit.teeth} tone={tone} className="shrink-0 md:w-64" />
              ) : null}
              <ul
                aria-label={copy.proceduresOf(visit.visit)}
                className={cn('flex min-w-0 flex-1 flex-col divide-y border-y', t.rule)}
              >
                {visit.lines.map((line) => {
                  const tooth = showTeeth ? toothLine(line) : null;
                  return (
                    <li
                      key={line.key}
                      data-testid="presentation-line"
                      className={cn('flex min-w-0 items-start justify-between gap-3 py-2 text-sm', t.rule)}
                    >
                      <div className="min-w-0">
                        <p lang={line.language} className={cn('whitespace-pre-line break-words font-medium', t.ink)}>
                          {line.label}
                        </p>
                        {tooth ? <p className={cn('text-xs tabular-nums', t.muted)}>{tooth}</p> : null}
                      </div>
                      {showMoney ? (
                        <p className={cn('shrink-0 text-right font-medium tabular-nums', t.ink)}>{money(line.subtotal)}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
            {showMoney ? (
              <p
                data-testid={`presentation-visit-total-${visit.visit}`}
                className={cn('flex justify-between gap-3 text-sm font-semibold tabular-nums', t.ink)}
              >
                <span>{copy.visitTotal}</span>
                <span>{money(visit.total)}</span>
              </p>
            ) : null}
          </section>
        );
      })}

      {showMoney && showPlanTotal ? (
        <dl
          aria-label={copy.totalsLabel}
          data-testid="presentation-plan-total"
          className="presentation-totals ml-auto flex w-full max-w-sm flex-col gap-1 text-sm break-inside-avoid"
        >
          <div className={cn('flex justify-between gap-4 border-t pt-2 text-base font-semibold', t.strong, t.ink)}>
            <dt>{copy.planTotal(model.currency)}</dt>
            <dd className="tabular-nums">{money(model.total)}</dd>
          </div>
          {secondTotal ? (
            <>
              <div data-testid="presentation-second-total" className="flex justify-between gap-4">
                <dt className={t.muted}>{secondTotal.label}</dt>
                <dd className={cn('tabular-nums', t.ink)}>{secondTotal.amount}</dd>
              </div>
              <p className={cn('text-xs', t.muted)}>{secondTotal.note}</p>
            </>
          ) : null}
        </dl>
      ) : null}
    </div>
  );
}
