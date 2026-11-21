import { apiFetch, apiFetchBlob, type ApiBlob } from '@/lib/api/client';
import { amountCents, centsToAmount, roundCents } from '@/lib/money/round';
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

export function ruleSummary(
  rule: Pick<CommissionRule, 'basis' | 'releaseMode' | 'percent' | 'categories'> &
    Partial<Pick<CommissionRule, 'deductLabCost' | 'deductCardFee'>>,
): string {
  const base = `${percentText(rule.percent)} de ${COMMISSION_BASIS_LABELS[rule.basis].toLowerCase()}`;
  const release = COMMISSION_RELEASE_LABELS[rule.releaseMode].toLowerCase();
  const categories =
    rule.categories.length === 0
      ? ''
      : ` · ${rule.categories.length === 1 ? '1 categoría' : `${rule.categories.length} categorías`} con % propio`;
  const deductions = deductionsSummary(rule);
  return `${base}, ${release}${categories}${deductions ? ` · ${deductions}` : ''}`;
}

/** DX-018-bis: «descuenta laboratorio y pasarela» (o uno), o null sin descuentos. */
export function deductionsSummary(rule: { deductLabCost?: boolean; deductCardFee?: boolean }): string | null {
  const parts = [rule.deductLabCost ? 'laboratorio' : null, rule.deductCardFee ? 'pasarela' : null].filter(Boolean);
  return parts.length === 0 ? null : `descuenta ${parts.join(' y ')}`;
}

/** DX-018-bis: la línea descontó algo de su base (o avisa de un laboratorio en otra moneda). */
export function lineHasDeductions(line: Pick<CommissionLine, 'deductions'>): boolean {
  const d = line.deductions;
  return d.labCost !== 0 || d.cardFee !== 0 || d.labCostSkippedCurrencies.length > 0;
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

// ── DX-464: pagar la liquidación, PDF y conformidad ─────────────────────────

export type CommissionPaymentStatus = components['schemas']['CommissionSettlementPaymentStatus'];
export type CommissionPaymentSummary = components['schemas']['SettlementPaymentSummaryDto'];
export type CommissionCurrencyPayment = components['schemas']['CommissionCurrencyPaymentStateDto'];
export type CommissionPayment = components['schemas']['CommissionPaymentDto'];
export type CommissionReceiptStatus = components['schemas']['CommissionReceiptStatus'];
export type PayCommissionSettlementInput = components['schemas']['PayCommissionSettlementDto'];
export type CommissionReceiptLink = components['schemas']['CommissionReceiptLinkDto'];
export type PublicCommissionReceipt = components['schemas']['PublicCommissionReceiptDto'];
export type PublicCommissionReceiptLine = components['schemas']['PublicReceiptLineDto'];
export type SignCommissionReceiptInput = components['schemas']['SignCommissionReceiptDto'];

/** Ruta pública de la conformidad (la arma la API: `COMMISSION_RECEIPT_PUBLIC_PATH`). */
export const COMMISSION_RECEIPT_PATH = '/conformidad';

/** Límites de la API (VoidCommissionPaymentDto, SignCommissionReceiptDto). */
export const COMMISSION_PAYMENT_LIMITS = {
  voidReasonMin: 5,
  voidReasonMax: 500,
  referenceMax: 120,
  signerNameMin: 2,
  signerNameMax: 120,
} as const;

/** `POST /commissions/settlements/:id/payments` — una moneda; el importe = Σ de las líneas. */
export function payCommissionSettlement(
  token: string,
  settlementId: string,
  input: PayCommissionSettlementInput,
): Promise<CommissionPayment> {
  return apiFetch<CommissionPayment>(`/commissions/settlements/${encodeURIComponent(settlementId)}/payments`, {
    method: 'POST',
    body: input,
    token,
  });
}

/** `POST /commissions/payments/:id/void` — motivo de 5 a 500 caracteres. */
export function voidCommissionPayment(token: string, paymentId: string, reason: string): Promise<CommissionPayment> {
  return apiFetch<CommissionPayment>(`/commissions/payments/${encodeURIComponent(paymentId)}/void`, {
    method: 'POST',
    body: { reason },
    token,
  });
}

/** `GET /commissions/settlements/:id/pdf` — el PDF para el profesional (auditado). */
export function fetchCommissionSettlementPdf(token: string, settlementId: string): Promise<ApiBlob> {
  return apiFetchBlob(`/commissions/settlements/${encodeURIComponent(settlementId)}/pdf`, { token });
}

/** `GET /commissions/payments/:id/receipt/pdf` — el recibo del pago (el firmado, si ya firmó). */
export function fetchCommissionReceiptPdf(token: string, paymentId: string): Promise<ApiBlob> {
  return apiFetchBlob(`/commissions/payments/${encodeURIComponent(paymentId)}/receipt/pdf`, { token });
}

/** `POST /commissions/payments/:id/receipt-request` — enlace de un solo uso (72 h); revoca el anterior. */
export function requestCommissionReceipt(token: string, paymentId: string): Promise<CommissionReceiptLink> {
  return apiFetch<CommissionReceiptLink>(`/commissions/payments/${encodeURIComponent(paymentId)}/receipt-request`, {
    method: 'POST',
    token,
  });
}

function publicReceiptPath(linkToken: string, suffix = ''): string {
  return `/public/commission-receipts/${encodeURIComponent(linkToken)}${suffix}`;
}

/** `GET /public/commission-receipts/:token`, sin sesión (la clínica sale del host). */
export function getPublicCommissionReceipt(linkToken: string): Promise<PublicCommissionReceipt> {
  return apiFetch<PublicCommissionReceipt>(publicReceiptPath(linkToken));
}

/** `POST …/opened` (204): la primera apertura queda registrada; las demás no cambian nada. */
export function markPublicCommissionReceiptOpened(linkToken: string): Promise<void> {
  return apiFetch<void>(publicReceiptPath(linkToken, '/opened'), { method: 'POST' });
}

/** `POST …/sign` — nombre, firma PNG y «recibí conforme». */
export function signPublicCommissionReceipt(
  linkToken: string,
  input: SignCommissionReceiptInput,
): Promise<PublicCommissionReceipt> {
  return apiFetch<PublicCommissionReceipt>(publicReceiptPath(linkToken, '/sign'), { method: 'POST', body: input });
}

/** `GET …/pdf` — la copia firmada, mientras el enlace no caduque. */
export function downloadPublicCommissionReceipt(linkToken: string): Promise<ApiBlob> {
  return apiFetchBlob(publicReceiptPath(linkToken, '/pdf'));
}

/** Las líneas de `currency` que aún no cubre un pago vivo (incluidos los ajustes negativos). */
export function pendingLinesOf(settlement: Pick<CommissionSettlement, 'lines'>, currency: string): CommissionLine[] {
  return settlement.lines.filter((l) => l.currency === currency && l.id !== null && l.paidInPaymentId === null);
}

/** Las monedas que tienen algo positivo pendiente de pagar. */
export function payableCurrencies(summary: CommissionPaymentSummary): CommissionCurrencyPayment[] {
  return summary.currencies.filter((c) => c.pending > 0);
}

/** Σ de importes en céntimos (sin ruido de coma flotante), vuelta a importe. */
export function sumAmounts(amounts: readonly number[]): number {
  return centsToAmount(roundCents(amounts.reduce((acc, a) => acc + amountCents(a), 0)));
}

/** El pago en vivo (no anulado). */
export function isLivePayment(payment: Pick<CommissionPayment, 'voidedAt'>): boolean {
  return payment.voidedAt === null;
}

/** Nombre de archivo si la API no manda uno (siempre lo manda). */
export function commissionPdfFallbackName(kind: 'settlement' | 'receipt', id: string): string {
  return kind === 'settlement' ? `liquidacion-honorarios-${id.slice(0, 8)}.pdf` : `recibo-honorarios-${id.slice(0, 8)}.pdf`;
}

/** `mailto:` con asunto y cuerpo (sin destinatario si no hay email). */
export function mailtoHref(to: string | null, subject: string, body: string): string {
  const qs = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return `mailto:${to ? encodeURIComponent(to).replace(/%40/g, '@') : ''}?${qs}`;
}

/** WhatsApp sin número (el profesional se elige en la app): `https://wa.me/?text=`. */
export function whatsAppShareHref(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Cómo pinta la vista lo que el mensaje lleva (la sede de la pantalla). */
export interface ShareTexts {
  civilDate: (day: string) => string;
  amount: (value: number, currency: string) => string;
}

/** «Enviar» la liquidación (mailto / WhatsApp): período, totales por moneda, estado y, si hay, la conformidad. */
export function settlementShareMessage(
  input: {
    professionalName: string;
    period: { from: string; to: string };
    currencies: readonly CommissionCurrencyPayment[];
    statusLabel: string;
    receiptUrl: string | null;
  },
  t: ShareTexts,
): { subject: string; body: string } {
  const period = `${t.civilDate(input.period.from)} – ${t.civilDate(input.period.to)}`;
  const lines = [
    `Hola, ${input.professionalName}:`,
    '',
    `Te envío la liquidación de honorarios del período ${period}.`,
    '',
    ...input.currencies.map(
      (c) =>
        `${c.currency}: total ${t.amount(c.total, c.currency)} · pagado ${t.amount(c.paid, c.currency)} · pendiente ${t.amount(Math.max(c.pending, 0), c.currency)}`,
    ),
    `Estado: ${input.statusLabel}.`,
  ];
  if (input.receiptUrl) {
    lines.push('', `Para confirmar que recibiste el pago, firma tu conformidad aquí: ${input.receiptUrl}`);
  }
  lines.push('', 'Va adjunto el PDF de la liquidación.');
  return { subject: `Liquidación de honorarios ${period}`, body: lines.join('\n') };
}

/** El mensaje de «Pedir conformidad» para un pago. */
export function receiptRequestMessage(
  input: { professionalName: string; amount: string; paidOn: string; url: string; expires: string },
): { subject: string; body: string } {
  return {
    subject: 'Conformidad del pago de honorarios',
    body: [
      `Hola, ${input.professionalName}:`,
      '',
      `Registramos el pago de tus honorarios por ${input.amount} el ${input.paidOn}.`,
      `Revisa el recibo y firma «Recibí conforme» aquí: ${input.url}`,
      '',
      `El enlace sirve una sola vez y caduca el ${input.expires}.`,
    ].join('\n'),
  };
}
