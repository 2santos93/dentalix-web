import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { amountCents } from '@/lib/money/round';
import { moneyInputText, parseMoneyInput } from '@/lib/format/money';

// DX-285: honorario del caso de ortodoncia, cuenta y alineadores. Las formas
// salen del Swagger de la API.
export type OrthoCaseAccount = components['schemas']['OrthoCaseAccountDto'];
export type OrthoFee = components['schemas']['OrthoFeeDto'];
export type SetOrthoFeeInput = components['schemas']['SetOrthoFeeDto'];
export type OrthoAligners = components['schemas']['OrthoAlignersDto'];
export type OrthoAlignerSeries = components['schemas']['OrthoAlignerSeriesDto'];
export type OrthoAlignerDelivery = components['schemas']['OrthoAlignerDeliveryDto'];
export type CreateOrthoAlignerSeriesInput = components['schemas']['CreateOrthoAlignerSeriesDto'];
export type AddOrthoAlignerDeliveryInput = components['schemas']['AddOrthoAlignerDeliveryDto'];
export type OrthoAlignerArch = OrthoAlignerSeries['arch'];
export type OrthoAlignerState = OrthoAlignerSeries['state'];
export type OrthoBalanceFlag = components['schemas']['OrthoBalanceFlagDto'];

function casesPath(patientId: string, suffix = ''): string {
  return `/patients/${encodeURIComponent(patientId)}/ortho-cases${suffix}`;
}

function casePath(patientId: string, caseId: string, suffix = ''): string {
  return casesPath(patientId, `/${encodeURIComponent(caseId)}${suffix}`);
}

/** La cuenta del caso (los cuatro roles). */
export function getOrthoAccount(token: string, patientId: string, caseId: string): Promise<OrthoCaseAccount> {
  return apiFetch<OrthoCaseAccount>(casePath(patientId, caseId, '/account'), { token });
}

/** Las cuentas de los casos con honorario del paciente (recepción no lee el caso clínico). */
export function listOrthoAccounts(token: string, patientId: string): Promise<OrthoCaseAccount[]> {
  return apiFetch<OrthoCaseAccount[]>(casesPath(patientId, '/accounts'), { token });
}

export function setOrthoFee(
  token: string,
  patientId: string,
  caseId: string,
  input: SetOrthoFeeInput,
): Promise<OrthoCaseAccount> {
  return apiFetch<OrthoCaseAccount>(casePath(patientId, caseId, '/fee'), { method: 'PUT', body: input, token });
}

export function acceptOrthoFee(token: string, patientId: string, caseId: string): Promise<OrthoCaseAccount> {
  return apiFetch<OrthoCaseAccount>(casePath(patientId, caseId, '/fee/accept'), { method: 'POST', token });
}

export function getOrthoAligners(token: string, patientId: string, caseId: string): Promise<OrthoAligners> {
  return apiFetch<OrthoAligners>(casePath(patientId, caseId, '/aligners'), { token });
}

export function createOrthoAlignerSeries(
  token: string,
  patientId: string,
  caseId: string,
  input: CreateOrthoAlignerSeriesInput,
): Promise<OrthoAligners> {
  return apiFetch<OrthoAligners>(casePath(patientId, caseId, '/aligner-series'), {
    method: 'POST',
    body: input,
    token,
  });
}

export function addOrthoAlignerDelivery(
  token: string,
  patientId: string,
  caseId: string,
  seriesId: string,
  input: AddOrthoAlignerDeliveryInput,
): Promise<OrthoAligners> {
  return apiFetch<OrthoAligners>(
    casePath(patientId, caseId, `/aligner-series/${encodeURIComponent(seriesId)}/deliveries`),
    { method: 'POST', body: input, token },
  );
}

export { canReadOrthoAccount } from './ortho-roles';

export const ORTHO_ARCH_LABELS: Record<OrthoAlignerArch, string> = {
  UPPER: 'Superior',
  LOWER: 'Inferior',
  BOTH: 'Ambas arcadas',
};
export const ORTHO_ARCHES = Object.keys(ORTHO_ARCH_LABELS) as OrthoAlignerArch[];

export { orthoOverdueChipText } from './ortho-overdue';

export interface FeeDraft {
  total: string;
  initial: string;
  perVisit: string;
  visitCount: string;
  retention: string;
}

/** Un importe del formulario con los decimales de la moneda; vacío = 0. `null` si no se lee. */
export function parseFeeAmount(text: string, currency: string): number | null {
  if (text.trim() === '') return 0;
  const parsed = parseMoneyInput(text, currency);
  return parsed.ok ? parsed.value : null;
}

export type FeeCheck =
  | { ok: true; input: SetOrthoFeeInput }
  | { ok: false; message: string; field?: keyof FeeDraft; sumCents?: number };

export const FEE_MESSAGES = {
  amounts: 'Escribe los importes con hasta 2 decimales.',
  total: 'El honorario total tiene que ser mayor que 0.',
  visits: 'Los controles que se cobran son un número entero de 0 a 240.',
  split: 'El reparto no cuadra con el total: la inicial, los controles (importe × controles) y el retiro tienen que sumar exactamente el total.',
} as const;

/**
 * Comprueba el reparto como la API (al céntimo): total = inicial + importe por
 * control × controles + retiro. `sumCents` es lo que suma el reparto, para
 * enseñarlo junto al total.
 */
export function checkFee(draft: FeeDraft, currency: string): FeeCheck {
  const values = {
    total: parseFeeAmount(draft.total, currency),
    initial: parseFeeAmount(draft.initial, currency),
    perVisit: parseFeeAmount(draft.perVisit, currency),
    retention: parseFeeAmount(draft.retention, currency),
  };
  for (const key of ['total', 'initial', 'perVisit', 'retention'] as const) {
    if (values[key] === null) return { ok: false, message: FEE_MESSAGES.amounts, field: key };
  }
  const visitCount = draft.visitCount.trim() === '' ? 0 : Number(draft.visitCount);
  if (!Number.isInteger(visitCount) || visitCount < 0 || visitCount > 240) {
    return { ok: false, message: FEE_MESSAGES.visits, field: 'visitCount' };
  }
  const total = values.total as number;
  if (total <= 0) return { ok: false, message: FEE_MESSAGES.total, field: 'total' };
  const sumCents =
    amountCents(values.initial as number) +
    amountCents(values.perVisit as number) * visitCount +
    amountCents(values.retention as number);
  if (sumCents !== amountCents(total)) {
    return { ok: false, message: FEE_MESSAGES.split, sumCents };
  }
  return {
    ok: true,
    input: {
      total,
      initial: values.initial as number,
      perVisit: values.perVisit as number,
      visitCount,
      retention: values.retention as number,
    },
  };
}

/** Lo que suma el reparto escrito (céntimos), o `null` si algún importe no se lee. */
export function feeSumCents(draft: FeeDraft, currency: string): number | null {
  const parts = [draft.initial, draft.perVisit, draft.retention].map((t) => parseFeeAmount(t, currency));
  if (parts.some((p) => p === null)) return null;
  const count = draft.visitCount.trim() === '' ? 0 : Number(draft.visitCount);
  if (!Number.isInteger(count) || count < 0) return null;
  const [initial, perVisit, retention] = parts as number[];
  return amountCents(initial) + amountCents(perVisit) * count + amountCents(retention);
}

/** El borrador del formulario desde el honorario guardado, o con los controles previstos. */
export function feeDraftOf(fee: OrthoFee | null | undefined, plannedVisits: number): FeeDraft {
  if (!fee) return { total: '', initial: '', perVisit: '', visitCount: String(plannedVisits), retention: '' };
  return {
    total: moneyInputText(fee.total),
    initial: moneyInputText(fee.initial),
    perVisit: moneyInputText(fee.perVisit),
    visitCount: String(fee.visitCount),
    retention: moneyInputText(fee.retention),
  };
}

/** «Bandeja 5 de 20». */
export function trayLabel(series: Pick<OrthoAlignerSeries, 'currentTray' | 'totalTrays'>): string | null {
  return series.currentTray ? `Bandeja ${series.currentTray} de ${series.totalTrays}` : null;
}

export const ALIGNER_STATE_LABELS: Record<OrthoAlignerState, string> = {
  NOT_STARTED: 'Sin empezar',
  IN_PROGRESS: 'En curso',
  NEEDS_DELIVERY: 'Sin bandejas: entregar',
  FINISHED: 'Terminada',
};

/** La siguiente bandeja por entregar de la serie, o `null` si están todas. */
export function nextTrayToDeliver(series: Pick<OrthoAlignerSeries, 'lastDeliveredTray' | 'totalTrays'>): number | null {
  return series.lastDeliveredTray < series.totalTrays ? series.lastDeliveredTray + 1 : null;
}
