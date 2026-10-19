import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

// DX-027: la API documenta las respuestas con @ApiProperty, así que los tipos
// salen tal cual del contrato generado.
export type CashSettings = components['schemas']['CashSettingsDto'];
export type CashSessionDetail = components['schemas']['CashSessionDetailDto'];
export type CashSessionSummary = components['schemas']['CashSessionSummaryDto'];
export type CashSessionPage = components['schemas']['CashSessionPageDto'];
export type CurrentCashSession = components['schemas']['CurrentCashSessionDto'];
export type CashExpectedLine = components['schemas']['CashExpectedLineDto'];
export type CashClosing = components['schemas']['CashClosingDto'];
export type CashClosingLine = components['schemas']['CashClosingLineDto'];
export type CashAdjustment = components['schemas']['CashAdjustmentDto'];
export type CashAdjustmentKind = CashAdjustment['kind'];
export type CashSessionStatus = CashSessionSummary['status'];
export type OpenCashSessionInput = components['schemas']['OpenCashSessionDto'];
export type CloseCashSessionInput = components['schemas']['CloseCashSessionDto'];
export type CashCountInput = components['schemas']['CashCountInputDto'];
export type CashAdjustmentInput = components['schemas']['CreateCashAdjustmentDto'];

/** Mismos límites que la API (tras recortar). */
export const CASH_REASON_MIN = 3;
export const CASH_REASON_MAX = 300;
export const CASH_DIFFERENCE_REASON_MAX = 500;
export const CASH_NOTES_MAX = 500;

/** La caja por turno es del mostrador y de la gestión (CASH_SESSION_ROLES). */
export function canUseCashSessions(role: ClinicRole | null): boolean {
  return role === 'ADMIN' || role === 'RECEPTION';
}

/** Reabrir, corregir y los ajustes de caja: solo ADMIN (como la API). */
export function canManageCashSessions(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/** `GET /cash-sessions/settings`: «exigir caja abierta» y «arqueo ciego». */
export function getCashSettings(token: string): Promise<CashSettings> {
  return apiFetch<CashSettings>('/cash-sessions/settings', { token });
}

/** `PUT /cash-sessions/settings` (solo ADMIN). */
export function saveCashSettings(token: string, settings: CashSettings): Promise<CashSettings> {
  return apiFetch<CashSettings>('/cash-sessions/settings', {
    method: 'PUT',
    body: settings,
    token,
  });
}

/**
 * `GET /cash-sessions/current`: mi caja abierta en la sede activa (la cabecera
 * `X-Location-Id` la pone `apiFetch`; sin ella, la sede principal) y los
 * ajustes de caja.
 */
export function getCurrentCashSession(token: string): Promise<CurrentCashSession> {
  return apiFetch<CurrentCashSession>('/cash-sessions/current', { token });
}

/** `POST /cash-sessions/open`: abre mi caja en la sede activa con su fondo. */
export function openCashSession(token: string, input: OpenCashSessionInput): Promise<CashSessionDetail> {
  return apiFetch<CashSessionDetail>('/cash-sessions/open', {
    method: 'POST',
    body: input,
    token,
  });
}

export interface ListCashSessionsQuery {
  from?: string;
  to?: string;
  status?: CashSessionStatus;
  page?: number;
}

/**
 * `GET /cash-sessions`: los turnos de la sede activa (o de todas), más
 * recientes primero. ADMIN ve todos; RECEPTION, los suyos (lo decide la API).
 */
export function listCashSessions(token: string, query: ListCashSessionsQuery = {}): Promise<CashSessionPage> {
  const search = new URLSearchParams();
  if (query.from) search.set('from', query.from);
  if (query.to) search.set('to', query.to);
  if (query.status) search.set('status', query.status);
  if (query.page) search.set('page', String(query.page));
  const qs = search.toString();
  return apiFetch<CashSessionPage>(`/cash-sessions${qs ? `?${qs}` : ''}`, { token });
}

/** `GET /cash-sessions/:id`. */
export function getCashSession(token: string, id: string): Promise<CashSessionDetail> {
  return apiFetch<CashSessionDetail>(`/cash-sessions/${encodeURIComponent(id)}`, { token });
}

/** `POST /cash-sessions/:id/close`: arqueo y cierre (inmutable). */
export function closeCashSession(
  token: string,
  id: string,
  input: CloseCashSessionInput,
): Promise<CashSessionDetail> {
  return apiFetch<CashSessionDetail>(`/cash-sessions/${encodeURIComponent(id)}/close`, {
    method: 'POST',
    body: input,
    token,
  });
}

/** `POST /cash-sessions/:id/reopen` (solo ADMIN, con motivo). */
export function reopenCashSession(token: string, id: string, reason: string): Promise<CashSessionDetail> {
  return apiFetch<CashSessionDetail>(`/cash-sessions/${encodeURIComponent(id)}/reopen`, {
    method: 'POST',
    body: { reason },
    token,
  });
}

/** `POST /cash-sessions/:id/adjustments`: corrección de un cierre (solo ADMIN). */
export function addCashAdjustment(
  token: string,
  id: string,
  input: CashAdjustmentInput,
): Promise<CashAdjustment> {
  return apiFetch<CashAdjustment>(`/cash-sessions/${encodeURIComponent(id)}/adjustments`, {
    method: 'POST',
    body: input,
    token,
  });
}

/** Vista imprimible del informe de cierre (A4; el navegador lo guarda como PDF). */
export function cashSessionReportHref(id: string): string {
  return `/print/cash-sessions/${encodeURIComponent(id)}`;
}

/** Detalle de un turno dentro de la app. */
export function cashSessionHref(id: string): string {
  return `/caja/turnos/${encodeURIComponent(id)}`;
}
