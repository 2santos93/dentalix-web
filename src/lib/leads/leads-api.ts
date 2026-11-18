import { apiFetch } from '@/lib/api/client';
import { ApiError, type CandidateRef, type ExistingRecordRef } from '@/lib/api/api-error';
import { zonedDayStart } from '@/lib/format/date';
import { periodFor, type PeriodPresetKey } from '@/lib/reports/period-presets';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

type Schemas = components['schemas'];

// DX-556 · Prospectos: tipos del cliente generado (`npm run codegen`).
export type Lead = Schemas['LeadDto'];
export type LeadDetail = Schemas['LeadDetailDto'];
export type LeadNote = Schemas['LeadNoteDto'];
export type LeadPage = Schemas['LeadListDto'];
export type LeadBoard = Schemas['LeadBoardDto'];
export type LeadBoardColumn = Schemas['LeadBoardColumnDto'];
export type LeadCount = Schemas['LeadCountDto'];
export type LeadReport = Schemas['LeadReportDto'];
export type LeadReportLine = Schemas['LeadReportLineDto'];
export type LeadOwner = Schemas['LeadOwnerDto'];
export type LeadSettings = Schemas['LeadSettingsDto'];
export type LeadStage = Schemas['LeadStage'];
export type LeadChannel = Schemas['LeadChannel'];
export type LeadReason = Schemas['LeadReasonDto'];
export type LeadReasonKind = Schemas['LeadReasonKind'];
export type CreateLeadInput = Schemas['CreateLeadDto'];
export type UpdateLeadInput = Schemas['UpdateLeadDto'];
export type ConvertLeadInput = Schemas['ConvertLeadDto'];
export type ConvertLeadResult = Schemas['ConvertLeadResultDto'];
export type LeadReached = 'SCHEDULED' | 'ATTENDED';

export const LEADS_HREF = '/prospectos';
/** «Mi día» → la lista de los «sin contactar hace más de 24 h». */
export const LEADS_STALE_HREF = '/prospectos?stale=true';
export const LEADS_REPORT_HREF = '/prospectos/informe';
export const LEAD_SETTINGS_HREF = '/settings/prospectos';

export const leadHref = (id: string) => `${LEADS_HREF}/${encodeURIComponent(id)}`;

/** Topes de la API (los mismos CHECK de la BD). */
export const LEAD_NAME_MAX = 120;
export const LEAD_PHONE_INPUT_MAX = 40;
export const LEAD_NEXT_ACTION_NOTE_MAX = 200;
export const LEAD_NOTE_MAX = 1000;
export const LEAD_REASON_MIN = 2;
export const LEAD_REASON_MAX = 60;
export const LEAD_RETENTION_MONTHS_MIN = 1;
export const LEAD_RETENTION_MONTHS_MAX = 120;
/** Lo que trae una clínica nueva (la API). */
export const LEAD_RETENTION_MONTHS_DEFAULT = 12;
export const LEAD_PAGE_SIZE = 25;

export const LEAD_PHONE_TAKEN = 'LEAD_PHONE_TAKEN';
export const LEAD_AMBIGUOUS_PATIENTS = 'LEAD_AMBIGUOUS_PATIENTS';

/** Prospectos: LEAD_ROLES en la API (ADMIN y RECEPTION). */
export function canUseLeads(role: ClinicRole | null): boolean {
  return role === 'ADMIN' || role === 'RECEPTION';
}

/** Catálogo de motivos y retención: LEAD_ADMIN_ROLES (solo ADMIN). */
export function canManageLeadSettings(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/** Las columnas del tablero, en el orden del embudo. */
export const LEAD_STAGE_ORDER: readonly LeadStage[] = ['NEW', 'CONTACTED', 'SCHEDULED', 'ATTENDED', 'LOST'];

export const LEAD_CHANNEL_ORDER: readonly LeadChannel[] = [
  'WHATSAPP',
  'INSTAGRAM',
  'FACEBOOK',
  'PHONE',
  'WALK_IN',
  'REFERRAL',
  'WEBSITE',
  'OTHER',
];

export const LEAD_CHANNEL_LABELS: Record<LeadChannel, string> = {
  WHATSAPP: 'WhatsApp',
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  PHONE: 'Llamada',
  WALK_IN: 'En persona',
  REFERRAL: 'Recomendación',
  WEBSITE: 'Página web',
  OTHER: 'Otro',
};

/** El canal del alta rápida: casi todo entra por WhatsApp. */
export const DEFAULT_LEAD_CHANNEL: LeadChannel = 'WHATSAPP';

/**
 * Las etapas a las que se mueve A MANO desde cada una (copia de `MANUAL_MOVES`
 * de la API). «Cita agendada» y «Asistió» nunca: los pone la cita.
 */
const MANUAL_MOVES: Record<LeadStage, readonly LeadStage[]> = {
  NEW: ['CONTACTED', 'LOST'],
  CONTACTED: ['NEW', 'LOST'],
  SCHEDULED: ['CONTACTED', 'LOST'],
  ATTENDED: [],
  LOST: ['NEW', 'CONTACTED'],
};

export function manualStageTargets(stage: LeadStage): readonly LeadStage[] {
  return MANUAL_MOVES[stage];
}

/** El nombre de la ficha al convertir: la primera palabra es el nombre y el resto, el apellido. */
export function splitLeadName(fullName: string): { firstName: string; lastName: string } {
  const words = fullName.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  return { firstName: words[0] ?? '', lastName: words.slice(1).join(' ') };
}

/** `https://wa.me/<dígitos>`; `null` sin teléfono (anonimizado) o con algo que no son dígitos. */
export function leadWhatsAppHref(whatsAppDigits: string | null | undefined): string | null {
  if (!whatsAppDigits || !/^\d{6,15}$/.test(whatsAppDigits)) return null;
  return `https://wa.me/${whatsAppDigits}`;
}

/** ¿Se puede agendar la primera cita? Solo un prospecto abierto (la API lo pasa a «Cita agendada»). */
export function canScheduleFirstAppointment(lead: Pick<Lead, 'stage' | 'anonymized'>): boolean {
  return !lead.anonymized && (lead.stage === 'NEW' || lead.stage === 'CONTACTED');
}

// ── Errores con salida propia ───────────────────────────────────────────────

/** El 409 `LEAD_PHONE_TAKEN`: quién tiene ya el teléfono (o `null` si es otro error). */
export function phoneTakenOf(err: unknown): ExistingRecordRef | null {
  if (!(err instanceof ApiError) || err.status !== 409 || err.code !== LEAD_PHONE_TAKEN) return null;
  return err.existingRecord ?? { kind: 'LEAD', id: null, name: null };
}

/** El 409 `LEAD_AMBIGUOUS_PATIENTS`: los pacientes entre los que elegir (o `null`). */
export function ambiguousCandidatesOf(err: unknown): readonly CandidateRef[] | null {
  if (!(err instanceof ApiError) || err.status !== 409 || err.code !== LEAD_AMBIGUOUS_PATIENTS) return null;
  return err.candidates ?? [];
}

/** A dónde lleva «Abrir…» desde el aviso del teléfono repetido; `null` = otra sede (solo el aviso). */
export function existingRecordHref(existing: ExistingRecordRef): string | null {
  if (!existing.id) return null;
  return existing.kind === 'PATIENT' ? `/patients/${encodeURIComponent(existing.id)}` : leadHref(existing.id);
}

// ── Filtros en la URL ───────────────────────────────────────────────────────

export type LeadsView = 'tablero' | 'lista';

export interface LeadFilters {
  view: LeadsView;
  q: string;
  channel: LeadChannel | null;
  ownerId: string | null;
  /** Solo los «sin contactar hace más de 24 h» (lista). */
  stale: boolean;
  stage: LeadStage | null;
  reached: LeadReached | null;
  createdFrom: string | null;
  createdTo: string | null;
  page: number;
}

export const EMPTY_LEAD_FILTERS: LeadFilters = {
  view: 'tablero',
  q: '',
  channel: null,
  ownerId: null,
  stale: false,
  stage: null,
  reached: null,
  createdFrom: null,
  createdTo: null,
  page: 1,
};

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function isoInstant(value: string | null): string | null {
  return value && !Number.isNaN(Date.parse(value)) ? value : null;
}

/**
 * La vista y los filtros desde la URL. Los filtros que solo tiene la lista
 * (`stale`, `stage`, `reached`) la eligen aunque no diga `vista=lista`: el
 * enlace de «Mi día» y los del informe abren la lista.
 */
export function parseLeadFilters(params: Pick<URLSearchParams, 'get'>): LeadFilters {
  const stale = params.get('stale') === 'true';
  const stage = oneOf(params.get('stage'), LEAD_STAGE_ORDER);
  const reached = oneOf(params.get('reached'), ['SCHEDULED', 'ATTENDED'] as const);
  const listOnly = stale || stage !== null || reached !== null;
  const page = Number(params.get('page'));
  return {
    view: listOnly || params.get('vista') === 'lista' ? 'lista' : 'tablero',
    q: params.get('q')?.trim() ?? '',
    channel: oneOf(params.get('channel'), LEAD_CHANNEL_ORDER),
    ownerId: params.get('ownerId') || null,
    stale,
    stage,
    reached,
    createdFrom: isoInstant(params.get('createdFrom')),
    createdTo: isoInstant(params.get('createdTo')),
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

/** La URL de `/prospectos` con esos filtros (sin los vacíos ni la vista por defecto). */
export function leadFiltersHref(filters: Partial<LeadFilters>): string {
  const f = { ...EMPTY_LEAD_FILTERS, ...filters };
  const search = new URLSearchParams();
  const listOnly = f.stale || f.stage !== null || f.reached !== null;
  if (f.view === 'lista' && !listOnly) search.set('vista', 'lista');
  if (f.q) search.set('q', f.q);
  if (f.channel) search.set('channel', f.channel);
  if (f.ownerId) search.set('ownerId', f.ownerId);
  if (f.stale) search.set('stale', 'true');
  if (f.stage) search.set('stage', f.stage);
  if (f.reached) search.set('reached', f.reached);
  if (f.createdFrom) search.set('createdFrom', f.createdFrom);
  if (f.createdTo) search.set('createdTo', f.createdTo);
  if (f.view === 'lista' && f.page > 1) search.set('page', String(f.page));
  const q = search.toString();
  return q ? `${LEADS_HREF}?${q}` : LEADS_HREF;
}

/** ¿Hay algún filtro puesto (además de la vista)? Para «Quitar filtros» y el estado vacío. */
export function hasLeadFilters(f: LeadFilters): boolean {
  return Boolean(f.q || f.channel || f.ownerId || f.stale || f.stage || f.reached || f.createdFrom || f.createdTo);
}

function query(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '' && value !== false) search.set(key, String(value));
  }
  const q = search.toString();
  return q ? `?${q}` : '';
}

/** Los filtros comunes del tablero y la lista, como parámetros de la API. */
function scopeParams(f: Pick<LeadFilters, 'q' | 'channel' | 'ownerId' | 'createdFrom' | 'createdTo'>) {
  return { q: f.q, channel: f.channel, ownerId: f.ownerId, createdFrom: f.createdFrom, createdTo: f.createdTo };
}

// ── Llamadas ────────────────────────────────────────────────────────────────

/** `GET /leads`: la lista paginada de la sede activa (cabecera de `apiFetch`), más recientes primero. */
export function listLeads(token: string, f: LeadFilters, pageSize = LEAD_PAGE_SIZE): Promise<LeadPage> {
  return apiFetch<LeadPage>(
    `/leads${query({ ...scopeParams(f), stage: f.stage, reached: f.reached, stale: f.stale, page: f.page, pageSize })}`,
    { token },
  );
}

/** `GET /leads/board`: las cinco etapas con su total y los primeros de cada una. */
export function getLeadBoard(token: string, f: LeadFilters): Promise<LeadBoard> {
  return apiFetch<LeadBoard>(`/leads/board${query(scopeParams(f))}`, { token });
}

/** `GET /leads/report`: prospectos dados de alta en [from, to). */
export function getLeadReport(token: string, range: { from: string; to: string }): Promise<LeadReport> {
  return apiFetch<LeadReport>(`/leads/report${query(range)}`, { token });
}

export function getLeadOwners(token: string): Promise<LeadOwner[]> {
  return apiFetch<LeadOwner[]>('/leads/owners', { token });
}

export function getLead(token: string, id: string): Promise<LeadDetail> {
  return apiFetch<LeadDetail>(`/leads/${encodeURIComponent(id)}`, { token });
}

export function createLead(token: string, input: CreateLeadInput): Promise<Lead> {
  return apiFetch<Lead>('/leads', { token, method: 'POST', body: input });
}

export function updateLead(token: string, id: string, input: UpdateLeadInput): Promise<Lead> {
  return apiFetch<Lead>(`/leads/${encodeURIComponent(id)}`, { token, method: 'PATCH', body: input });
}

export function changeLeadStage(
  token: string,
  id: string,
  stage: LeadStage,
  lostReason?: string | null,
): Promise<Lead> {
  return apiFetch<Lead>(`/leads/${encodeURIComponent(id)}/stage`, {
    token,
    method: 'POST',
    body: lostReason ? { stage, lostReason } : { stage },
  });
}

export function addLeadNote(token: string, id: string, body: string): Promise<LeadNote> {
  return apiFetch<LeadNote>(`/leads/${encodeURIComponent(id)}/notes`, { token, method: 'POST', body: { body } });
}

export function convertLead(token: string, id: string, input: ConvertLeadInput): Promise<ConvertLeadResult> {
  return apiFetch<ConvertLeadResult>(`/leads/${encodeURIComponent(id)}/convert`, {
    token,
    method: 'POST',
    body: input,
  });
}

export function getLeadSettings(token: string): Promise<LeadSettings> {
  return apiFetch<LeadSettings>('/leads/settings', { token });
}

export function updateLeadSettings(token: string, input: LeadSettings): Promise<LeadSettings> {
  return apiFetch<LeadSettings>('/leads/settings', { token, method: 'PUT', body: input });
}

export function listLeadReasons(token: string, kind?: LeadReasonKind): Promise<LeadReason[]> {
  return apiFetch<LeadReason[]>(`/lead-reasons${query({ kind })}`, { token });
}

export function createLeadReason(token: string, kind: LeadReasonKind, name: string): Promise<LeadReason> {
  return apiFetch<LeadReason>('/lead-reasons', { token, method: 'POST', body: { kind, name } });
}

export function removeLeadReason(token: string, id: string): Promise<void> {
  return apiFetch<void>(`/lead-reasons/${encodeURIComponent(id)}`, { token, method: 'DELETE' });
}

// ── Informe ─────────────────────────────────────────────────────────────────

export type LeadReportPeriod = Extract<PeriodPresetKey, 'this_month' | 'last_month' | 'last_30_days'>;
export const LEAD_REPORT_PERIODS: readonly LeadReportPeriod[] = ['this_month', 'last_month', 'last_30_days'];

function nextCivilDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/**
 * El período del informe en instantes ISO [from, to) con la zona de la sede:
 * del inicio del primer día al inicio del día siguiente al último. `today` es
 * «hoy» en esa zona (`civilDateInZone`).
 */
export function leadReportRange(
  period: LeadReportPeriod,
  today: string,
  timeZone: string,
): { from: string; to: string } | null {
  const civil = periodFor(period, today);
  if (!civil) return null;
  const from = zonedDayStart(civil.from, timeZone);
  const to = zonedDayStart(nextCivilDay(civil.to), timeZone);
  return from && to ? { from, to } : null;
}

/**
 * La lista con los filtros de una cifra del informe: el mismo período, el
 * canal o el responsable de la fila y, si la cifra es «con cita» o
 * «asistieron», `reached`. Así la lista cuenta lo mismo que el informe.
 */
export function reportFigureHref(
  range: { from: string; to: string },
  line: { channel?: LeadChannel | null; ownerId?: string | null },
  reached: LeadReached | null,
): string {
  return leadFiltersHref({
    view: 'lista',
    createdFrom: range.from,
    createdTo: range.to,
    channel: line.channel ?? null,
    ownerId: line.ownerId ?? null,
    reached,
  });
}
