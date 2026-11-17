import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

// DX-018: honorarios de odontólogos a porcentaje. Las formas salen del
// Swagger de la API (tag commissions). Los importes vienen ya redondeados por
// la API, cada uno en su moneda: la web los pinta, nunca suma monedas.
export type CommissionBasis = components['schemas']['CommissionRuleDto']['basis'];
export type CommissionReleaseMode = components['schemas']['CommissionRuleDto']['releaseMode'];
export type CommissionRule = components['schemas']['CommissionRuleDto'];
export type CommissionRules = components['schemas']['CommissionRulesDto'];
export type ProfessionalCommissionRule = components['schemas']['ProfessionalCommissionRuleDto'];
export type CommissionProfessional = components['schemas']['CommissionProfessionalDto'];
export type SaveCommissionRuleInput = components['schemas']['SaveCommissionRuleDto'];
export type CommissionPreview = components['schemas']['CommissionPreviewDto'];
export type CommissionLine = components['schemas']['CommissionLineDto'];
export type CommissionTotal = components['schemas']['CommissionCurrencyTotalDto'];
export type CommissionSettlementSummary = components['schemas']['CommissionSettlementSummaryDto'];
export type CommissionSettlement = components['schemas']['CommissionSettlementDto'];

export const COMMISSIONS_HREF = '/honorarios';
export const COMMISSION_SETTINGS_HREF = '/settings/honorarios';

export function commissionSettlementHref(id: string): string {
  return `${COMMISSIONS_HREF}/${encodeURIComponent(id)}`;
}

export function commissionSettlementPrintHref(id: string): string {
  return `/print/commission-settlements/${encodeURIComponent(id)}`;
}

/** Configurar reglas y cerrar liquidaciones (COMMISSION_WRITE_ROLES): solo ADMIN. */
export function canManageCommissions(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/** Ver honorarios (COMMISSION_READ_ROLES): ADMIN toda la clínica; DENTIST, lo suyo. */
export function canViewCommissions(role: ClinicRole | null): boolean {
  return role === 'ADMIN' || role === 'DENTIST';
}

export const COMMISSION_LIMITS = {
  categoriesMax: 50,
  categoryMax: 120,
  percentMin: 0,
  percentMax: 100,
} as const;

export const COMMISSION_BASIS_LABELS: Record<CommissionBasis, string> = {
  COLLECTED: 'Lo cobrado',
  PRODUCED: 'Lo producido',
};

export const COMMISSION_RELEASE_LABELS: Record<CommissionReleaseMode, string> = {
  PER_ITEM: 'Por prestación',
  PER_PLAN: 'Con el plan completo y pagado',
};

/** «35 %» con coma decimal; el espacio no se parte (el % nunca queda solo en otra línea). */
export function percentText(percent: number): string {
  return `${String(percent).replace('.', ',')}\u00a0%`;
}

export function ruleSummary(rule: Pick<CommissionRule, 'basis' | 'releaseMode' | 'percent' | 'categories'>): string {
  const base = `${percentText(rule.percent)} de ${COMMISSION_BASIS_LABELS[rule.basis].toLowerCase()}`;
  const release = COMMISSION_RELEASE_LABELS[rule.releaseMode].toLowerCase();
  const categories =
    rule.categories.length === 0
      ? ''
      : ` · ${rule.categories.length === 1 ? '1 categoría' : `${rule.categories.length} categorías`} con % propio`;
  return `${base}, ${release}${categories}`;
}

// ── Rutas ───────────────────────────────────────────────────────────────────

export function listCommissionRules(token: string): Promise<CommissionRules> {
  return apiFetch<CommissionRules>('/commissions/rules', { token });
}

export function saveCommissionRule(
  token: string,
  userId: string,
  input: SaveCommissionRuleInput,
): Promise<ProfessionalCommissionRule> {
  return apiFetch<ProfessionalCommissionRule>(`/commissions/rules/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    body: input,
    token,
  });
}

export function getCommissionPreview(
  token: string,
  query: { userId?: string | null; from: string; to: string },
): Promise<CommissionPreview> {
  const qs = new URLSearchParams({ from: query.from, to: query.to });
  if (query.userId) qs.set('userId', query.userId);
  return apiFetch<CommissionPreview>(`/commissions/preview?${qs.toString()}`, { token });
}

export function closeCommissionSettlement(
  token: string,
  input: { userId: string; from: string; to: string },
): Promise<CommissionSettlement> {
  return apiFetch<CommissionSettlement>('/commissions/settlements', { method: 'POST', body: input, token });
}

export function listCommissionSettlements(
  token: string,
  query: { userId?: string | null } = {},
): Promise<CommissionSettlementSummary[]> {
  const qs = query.userId ? `?userId=${encodeURIComponent(query.userId)}` : '';
  return apiFetch<CommissionSettlementSummary[]>(`/commissions/settlements${qs}`, { token });
}

export function getCommissionSettlement(token: string, id: string): Promise<CommissionSettlement> {
  return apiFetch<CommissionSettlement>(`/commissions/settlements/${encodeURIComponent(id)}`, { token });
}

// ── Período ─────────────────────────────────────────────────────────────────

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Primer y último día del mes de `day` (AAAA-MM-DD). */
export function monthOf(day: string): { from: string; to: string } {
  const [y, m] = day.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last)}` };
}

/** El mes anterior al de `day`. */
export function previousMonthOf(day: string): { from: string; to: string } {
  const [y, m] = day.split('-').map(Number);
  const prev = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
  return monthOf(`${prev.y}-${pad(prev.m)}-01`);
}

/**
 * El período que se propone: si ya hay liquidaciones, el mes que empieza el
 * día siguiente a la última (hasta fin de ese mes); si no, el mes anterior a hoy.
 */
export function suggestedPeriod(today: string, nextFrom: string | null): { from: string; to: string } {
  if (nextFrom) return { from: nextFrom, to: monthOf(nextFrom).to };
  return previousMonthOf(today);
}
