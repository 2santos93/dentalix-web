import type { ToothSurface } from '@/lib/odontogram/odontogram-api';
import { isFdiToothNumber } from '@/lib/odontogram/fdi';
import { roundAmount } from '@/lib/money/round';
import type { PlanQuote } from '@/lib/treatment-plans/plan-quote-api';
import type { PublicBudget, PublicBudgetPresentation } from '@/lib/signature-requests/signature-requests-api';

/**
 * DX-560 · «Presentar» el plan al paciente: el modelo común de la pantalla de
 * la clínica (`/presentar/…`, con el `GET …/quote` y su `presentation`) y de
 * la página pública (`/firmar/[token]`, con la `presentation` congelada del
 * enlace). Las dos pintan las mismas visitas con los mismos importes; nunca
 * un código ni un id: el texto es el del paciente o, sin él, el nombre del
 * catálogo que ya trae el presupuesto («Procedimiento» si no hay).
 */

/** Las tres vistas (`?vista=`). */
export type { PresentationMode } from './plan-presentation-href';
import type { PresentationMode } from './plan-presentation-href';

export const PRESENTATION_MODES: readonly PresentationMode[] = ['completa', 'clinica', 'economica'];

export const PRESENTATION_MODE_LABELS: Record<PresentationMode, string> = {
  completa: 'Completa',
  clinica: 'Clínica',
  economica: 'Económica',
};

export { ACCEPT_PARAM, PRESENTATION_VIEW_PARAM, planPresentHref, planTabHref } from './plan-presentation-href';

/** Texto del procedimiento cuando no hay ninguno (el mismo de la API). */
export const PROCEDURE_FALLBACK = 'Procedimiento';

/** El idioma del texto de respaldo (el nombre del catálogo es español). */
const FALLBACK_LANGUAGE = 'es';

export function parsePresentationMode(value: string | null | undefined): PresentationMode {
  return PRESENTATION_MODES.includes(value as PresentationMode) ? (value as PresentationMode) : 'completa';
}

/** ¿La vista pinta importes? Clínica no lleva ninguno. */
export function modeShowsMoney(mode: PresentationMode): boolean {
  return mode !== 'clinica';
}

/** ¿La vista pinta dientes, caras y odontograma? Económica no. */
export function modeShowsTeeth(mode: PresentationMode): boolean {
  return mode !== 'economica';
}

export interface PresentationLine {
  key: string;
  /** Texto para el paciente: SIEMPRE texto plano. */
  label: string;
  /** Idioma de `label` (BCP 47), para su `lang`. */
  language: string;
  toothNumber: string;
  surfaces: ToothSurface[];
  subtotal: number;
}

export interface PresentationVisit {
  visit: number;
  label: string | null;
  minDaysAfterPrevious: number;
  lines: PresentationLine[];
  /** Suma de los subtotales de la visita, en la moneda del plan. */
  total: number;
  /** Dientes FDI de la visita, sin repetir, en el orden en que salen. */
  teeth: string[];
}

export interface PlanPresentationModel {
  currency: string;
  /** Idioma preferido del paciente (para el `lang` del documento). */
  language: string;
  visits: PresentationVisit[];
  /** Total del plan en su moneda (el neto del presupuesto). */
  total: number;
}

function procedureText(label: string | null | undefined): string {
  const text = label?.trim();
  return text ? text : PROCEDURE_FALLBACK;
}


function groupVisits(
  rows: { visit: number; line: PresentationLine }[],
  visitInfo: (visit: number) => { label: string | null; minDaysAfterPrevious: number },
): PresentationVisit[] {
  const byVisit = new Map<number, PresentationLine[]>();
  for (const { visit, line } of rows) {
    const list = byVisit.get(visit) ?? [];
    list.push(line);
    byVisit.set(visit, list);
  }
  return [...byVisit.entries()]
    .sort(([a], [b]) => a - b)
    .map(([visit, lines]) => {
      const info = visitInfo(visit);
      const teeth = [...new Set(lines.map((l) => l.toothNumber).filter((t) => isFdiToothNumber(t)))];
      return {
        visit,
        label: info.label,
        minDaysAfterPrevious: info.minDaysAfterPrevious,
        lines,
        total: roundAmount(lines.reduce((sum, l) => sum + l.subtotal, 0)),
        teeth,
      };
    });
}

function planTotal(
  totals: readonly { currency: string; net: number }[],
  currency: string,
  visits: readonly PresentationVisit[],
): number {
  return (
    totals.find((t) => t.currency === currency)?.net ??
    roundAmount(visits.reduce((sum, v) => sum + v.total, 0))
  );
}

/** Desde el presupuesto de la clínica (`GET …/quote`). */
export function presentationFromQuote(quote: PlanQuote): PlanPresentationModel {
  const presented = new Map((quote.presentation?.items ?? []).map((p) => [p.itemId, p]));
  const organized = new Map((quote.visitOrganization ?? []).map((v) => [v.itemId, v]));
  const rows = quote.items.map((item) => {
    const p = presented.get(item.id);
    const o = organized.get(item.id);
    return {
      visit: o?.visit ?? p?.visit ?? 1,
      line: {
        key: item.id,
        label: p ? procedureText(p.label) : procedureText(item.procedure),
        language: p?.language ?? FALLBACK_LANGUAGE,
        toothNumber: item.toothNumber,
        surfaces: item.surfaces,
        subtotal: item.subtotal,
      },
    };
  });
  const visitOrg = quote.visitOrganization ?? [];
  const visits = groupVisits(rows, (visit) => {
    const v = visitOrg.find((o) => o.visit === visit);
    return { label: v?.label ?? null, minDaysAfterPrevious: v?.minDaysAfterPrevious ?? 0 };
  });
  return {
    currency: quote.currency,
    language: quote.presentation?.language ?? FALLBACK_LANGUAGE,
    visits,
    total: planTotal(quote.totals, quote.currency, visits),
  };
}

/** Desde el enlace público (la `presentation` congelada al enviarlo). */
export function presentationFromPublic(
  budget: PublicBudget,
  presentation: PublicBudgetPresentation,
): PlanPresentationModel {
  const presented = new Map(presentation.items.map((p) => [p.index, p]));
  const rows = budget.items.map((item, index) => {
    const p = presented.get(index);
    return {
      visit: p?.visit ?? 1,
      line: {
        key: String(index),
        label: p ? procedureText(p.label) : procedureText(item.procedure),
        language: p?.language ?? presentation.language ?? FALLBACK_LANGUAGE,
        toothNumber: item.toothNumber,
        surfaces: item.surfaces,
        subtotal: item.subtotal,
      },
    };
  });
  const visits = groupVisits(rows, (visit) => {
    const v = presentation.visitOrganization.find((o) => o.visit === visit);
    return { label: v?.label ?? null, minDaysAfterPrevious: v?.minDaysAfterPrevious ?? 0 };
  });
  return {
    currency: budget.currency,
    language: presentation.language,
    visits,
    total: planTotal(budget.totals, budget.currency, visits),
  };
}
