import { apiFetch, apiFetchText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

// «Embudo de presupuestos» (DX-558).
type Schemas = components['schemas'];

/**
 * El embudo del período. Importes en la moneda del catálogo (`currency`; null
 * sin ella, y entonces todos los importes son null). Las tasas vienen en %
 * con 1 decimal (40 = 40 %), null sin base.
 */
export type QuoteFunnelReport = Schemas['QuoteFunnelReportDto'];
export type QuoteFunnelStep = Schemas['QuoteFunnelStepDto'];
export type QuoteFunnelStepKey = QuoteFunnelStep['key'];
export type QuoteFunnelCountAmount = Schemas['QuoteFunnelCountAmountDto'];
export type QuoteFunnelProfessionalRow = Schemas['QuoteFunnelProfessionalDto'];
export type QuoteFunnelRejectionReason = Schemas['QuoteFunnelRejectionReasonDto'];
export type QuoteFunnelRejectionReasonKey = QuoteFunnelRejectionReason['reason'];
export type QuoteFunnelDefinition = Schemas['QuoteFunnelDefinitionDto'];
export type QuoteFunnelPresentations = Schemas['QuoteFunnelPresentationsDto'];
export type QuoteFunnelPresentation = Schemas['QuoteFunnelPresentationDto'];
export type QuoteFunnelOutcome = QuoteFunnelPresentation['outcome'];

/** Desenlaces de lo no aceptado, como claves de `outcomes`. */
export type QuoteFunnelOutcomeKey = keyof Schemas['QuoteFunnelOutcomesDto'];

/** Lo que abre el detalle: un paso del embudo o un desenlace (`step` de la API). */
export type QuoteFunnelDetailStep = QuoteFunnelStepKey | 'PENDING' | 'REJECTED' | 'CANCELLED';

export interface QuoteFunnelFilters {
  /** Días civiles de la sede donde se presentó, AAAA-MM-DD. */
  from: string;
  to: string;
  locationId?: string;
  /** Quien ELABORÓ el presupuesto. */
  providerId?: string;
}

function params(filters: QuoteFunnelFilters): URLSearchParams {
  const p = new URLSearchParams({ from: filters.from, to: filters.to });
  if (filters.locationId) p.set('locationId', filters.locationId);
  if (filters.providerId) p.set('providerId', filters.providerId);
  return p;
}

/** `GET /reports/quote-funnel`: la sede va en `locationId` (la cabecera X-Location-Id no acota). */
export function getQuoteFunnel(token: string, filters: QuoteFunnelFilters): Promise<QuoteFunnelReport> {
  return apiFetch<QuoteFunnelReport>(`/reports/quote-funnel?${params(filters).toString()}`, { token });
}

/**
 * `GET /reports/quote-funnel/presentations`: las presentaciones de una cifra,
 * con los mismos filtros. `reason` solo con `step = 'REJECTED'` (la API da 400
 * si no). Lleva nombres de paciente: la API lo audita.
 */
export function getQuoteFunnelPresentations(
  token: string,
  filters: QuoteFunnelFilters,
  step: QuoteFunnelDetailStep,
  reason: QuoteFunnelRejectionReasonKey | null | undefined,
  page: number,
  pageSize: number,
): Promise<QuoteFunnelPresentations> {
  const p = params(filters);
  p.set('step', step);
  if (reason && step === 'REJECTED') p.set('reason', reason);
  p.set('page', String(page));
  p.set('pageSize', String(pageSize));
  return apiFetch<QuoteFunnelPresentations>(`/reports/quote-funnel/presentations?${p.toString()}`, { token });
}

/** `GET /reports/quote-funnel.csv` (solo ADMIN; con FINANCIAL_REPORTS_VIEW la API da 403): los mismos filtros. */
export function downloadQuoteFunnelCsv(token: string, filters: QuoteFunnelFilters): Promise<string> {
  return apiFetchText(`/reports/quote-funnel.csv?${params(filters).toString()}`, { token });
}

/** Los pasos en el orden del embudo (el mismo que da la API). */
export const QUOTE_FUNNEL_STEP_LABELS: Record<QuoteFunnelStepKey, string> = {
  PRESENTED: 'Presentados',
  ACCEPTED: 'Aceptados',
  SCHEDULED: 'Agendados',
  DONE: 'Realizados',
  COLLECTED: 'Cobrados',
};

/** Lo no aceptado, en el orden en que se pinta. */
export const QUOTE_FUNNEL_OUTCOMES: readonly { key: QuoteFunnelOutcomeKey; step: QuoteFunnelDetailStep; label: string }[] = [
  { key: 'pending', step: 'PENDING', label: 'Pendientes' },
  { key: 'rejected', step: 'REJECTED', label: 'Rechazados' },
  { key: 'cancelled', step: 'CANCELLED', label: 'Cancelados' },
];

/** Título del detalle de cada cifra. */
export const QUOTE_FUNNEL_DETAIL_LABELS: Record<QuoteFunnelDetailStep, string> = {
  ...QUOTE_FUNNEL_STEP_LABELS,
  PENDING: 'Pendientes',
  REJECTED: 'Rechazados',
  CANCELLED: 'Cancelados',
};

/** El desenlace de una presentación (columna del detalle). */
export const QUOTE_FUNNEL_OUTCOME_LABELS: Record<QuoteFunnelOutcome, string> = {
  ACCEPTED: 'Aceptado',
  PENDING: 'Pendiente',
  REJECTED: 'Rechazado',
  CANCELLED: 'Cancelado',
};

/** Paso → clave de la fila por profesional. */
export const QUOTE_FUNNEL_PROFESSIONAL_FIELD = {
  PRESENTED: 'presented',
  ACCEPTED: 'accepted',
  SCHEDULED: 'scheduled',
  DONE: 'done',
  COLLECTED: 'collected',
} as const satisfies Record<QuoteFunnelStepKey, keyof QuoteFunnelProfessionalRow>;

/** El importe de cada paso en una presentación del detalle. */
export function presentationAmount(item: QuoteFunnelPresentation, step: QuoteFunnelDetailStep): number | null {
  switch (step) {
    case 'ACCEPTED':
      return item.acceptedAmount;
    case 'SCHEDULED':
      return item.scheduledAmount;
    case 'DONE':
      return item.doneAmount;
    case 'COLLECTED':
      return item.collectedAmount;
    default:
      return item.presentedAmount;
  }
}

/** ¿El embudo tiene algo que enseñar? (sin presentaciones, el vacío). */
export function hasPresentations(report: QuoteFunnelReport): boolean {
  return (report.steps.find((s) => s.key === 'PRESENTED')?.count ?? 0) > 0;
}
