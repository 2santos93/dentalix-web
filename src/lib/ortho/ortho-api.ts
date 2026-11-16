import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { whatsAppUrl } from '@/lib/appointments/confirmation-message';
import { telHref } from '@/lib/receivables/presentation';

// Ortodoncia (DX-190). Las formas salen del Swagger de la API.
export type OrthoCase = components['schemas']['OrthoCaseDto'];
export type OrthoVisit = components['schemas']['OrthoVisitDto'];
export type OrthoWire = components['schemas']['OrthoWireDto'];
export type OrthoSettings = components['schemas']['OrthoSettingsDto'];
export type OrthoFollowUpRow = components['schemas']['OrthoFollowUpRowDto'];
export type OrthoFollowUpPage = components['schemas']['OrthoFollowUpPageDto'];
export type CreateOrthoCaseInput = components['schemas']['CreateOrthoCaseDto'];
export type RegisterOrthoVisitInput = components['schemas']['RegisterOrthoVisitDto'];
export type OrthoTechnique = OrthoCase['technique'];
export type OrthoCaseStatus = OrthoCase['status'];
export type OrthoWireMaterial = OrthoWire['material'];
export type OrthoElasticType = NonNullable<OrthoVisit['elasticsType']>;
export type OrthoElasticWear = NonNullable<OrthoVisit['elasticsWear']>;
export type OrthoIncident = OrthoVisit['incidents'][number];
export type OrthoFollowUpFilter = 'ALL' | 'OVERDUE' | 'NO_NEXT_APPOINTMENT';
export type OrthoClosingStatus = 'RETENTION' | 'FINISHED' | 'ABANDONED';

export const ORTHO_TECHNIQUE_LABELS: Record<OrthoTechnique, string> = {
  METAL_BRACKETS: 'Brackets metálicos',
  AESTHETIC_BRACKETS: 'Brackets estéticos',
  SELF_LIGATING: 'Autoligado',
  ALIGNERS: 'Alineadores',
  REMOVABLE: 'Removible',
  OTHER: 'Otra',
};
export const ORTHO_TECHNIQUES = Object.keys(ORTHO_TECHNIQUE_LABELS) as OrthoTechnique[];

export const ORTHO_WIRE_MATERIAL_LABELS: Record<OrthoWireMaterial, string> = {
  NITI: 'NiTi',
  STEEL: 'Acero',
  TMA: 'TMA',
  OTHER: 'Otro',
};
export const ORTHO_WIRE_MATERIALS = Object.keys(ORTHO_WIRE_MATERIAL_LABELS) as OrthoWireMaterial[];

export const ORTHO_ELASTIC_TYPE_LABELS: Record<OrthoElasticType, string> = {
  CLASS_II: 'Clase II',
  CLASS_III: 'Clase III',
  CROSS: 'Cruzados',
  BOX: 'En caja',
  TRIANGLE: 'Triangulares',
  OTHER: 'Otros',
};
export const ORTHO_ELASTIC_TYPES = Object.keys(ORTHO_ELASTIC_TYPE_LABELS) as OrthoElasticType[];

export const ORTHO_ELASTIC_WEAR_LABELS: Record<OrthoElasticWear, string> = {
  FULL_TIME: 'Todo el día',
  NIGHT: 'Solo de noche',
  PART_TIME: 'Parte del día',
};
export const ORTHO_ELASTIC_WEARS = Object.keys(ORTHO_ELASTIC_WEAR_LABELS) as OrthoElasticWear[];

export const ORTHO_INCIDENT_LABELS: Record<OrthoIncident, string> = {
  BRACKET_DEBONDED: 'Bracket despegado',
  BRACKET_BROKEN: 'Bracket roto',
  WIRE_DAMAGED: 'Arco dañado',
};
export const ORTHO_INCIDENTS = Object.keys(ORTHO_INCIDENT_LABELS) as OrthoIncident[];

/** Índice de higiene 1–4 (1 = buena). */
export const ORTHO_HYGIENE_LABELS: Record<number, string> = {
  1: '1 · Buena',
  2: '2 · Aceptable',
  3: '3 · Deficiente',
  4: '4 · Mala',
};

export { canReadOrtho, canWriteOrtho, canManageOrthoSettings, ORTHO_FOLLOW_UP_HREF, orthoTabHref } from './ortho-roles';

function casesPath(patientId: string, suffix = ''): string {
  return `/patients/${encodeURIComponent(patientId)}/ortho-cases${suffix}`;
}

export function updateOrthoSettings(
  token: string,
  input: Partial<OrthoSettings>,
): Promise<OrthoSettings> {
  return apiFetch<OrthoSettings>('/ortho/settings', { method: 'PUT', body: input, token });
}

/** `GET /patients/:id/ortho-cases` — el más reciente primero. */
export function listOrthoCases(token: string, patientId: string): Promise<OrthoCase[]> {
  return apiFetch<OrthoCase[]>(casesPath(patientId), { token });
}

export function createOrthoCase(
  token: string,
  patientId: string,
  input: CreateOrthoCaseInput,
): Promise<OrthoCase> {
  return apiFetch<OrthoCase>(casesPath(patientId), { method: 'POST', body: input, token });
}

export function changeOrthoCaseStatus(
  token: string,
  patientId: string,
  caseId: string,
  input: { status: OrthoClosingStatus; reason?: string },
): Promise<OrthoCase> {
  return apiFetch<OrthoCase>(casesPath(patientId, `/${encodeURIComponent(caseId)}/status`), {
    method: 'POST',
    body: input,
    token,
  });
}

/** Controles del caso con sus adendas, el más reciente primero. */
export function listOrthoVisits(token: string, patientId: string, caseId: string): Promise<OrthoVisit[]> {
  return apiFetch<OrthoVisit[]>(casesPath(patientId, `/${encodeURIComponent(caseId)}/visits`), { token });
}

export function registerOrthoVisit(
  token: string,
  patientId: string,
  caseId: string,
  input: RegisterOrthoVisitInput,
): Promise<OrthoVisit> {
  return apiFetch<OrthoVisit>(casesPath(patientId, `/${encodeURIComponent(caseId)}/visits`), {
    method: 'POST',
    body: input,
    token,
  });
}

export function listOrthoFollowUp(
  token: string,
  params: { filter?: OrthoFollowUpFilter; providerId?: string; page?: number } = {},
): Promise<OrthoFollowUpPage> {
  const qs = new URLSearchParams();
  if (params.filter && params.filter !== 'ALL') qs.set('filter', params.filter);
  if (params.providerId) qs.set('providerId', params.providerId);
  if (params.page && params.page > 1) qs.set('page', String(params.page));
  const query = qs.toString();
  return apiFetch<OrthoFollowUpPage>(`/ortho/follow-up${query ? `?${query}` : ''}`, { token });
}

/** El caso que admite controles (activo o en retención), si lo hay. */
export function openOrthoCase(cases: readonly OrthoCase[]): OrthoCase | null {
  return cases.find((c) => c.status === 'ACTIVE' || c.status === 'RETENTION') ?? null;
}

/** «NiTi 0.016x0.022». */
export function wireLabel(wire: OrthoWire | null | undefined): string | null {
  return wire ? `${ORTHO_WIRE_MATERIAL_LABELS[wire.material]} ${wire.gauge}` : null;
}

/** «Hace 50 días» / «Hoy». */
export function daysAgoLabel(days: number): string {
  if (days <= 0) return 'Hoy';
  return days === 1 ? 'Hace 1 día' : `Hace ${days} días`;
}

/** `tel:` y `wa.me` del paciente de la lista; `null` si no hay teléfono. */
export function contactLinks(
  row: Pick<OrthoFollowUpRow, 'patientPhone' | 'patientPhoneE164' | 'patientFirstName'>,
  clinicName: string | null,
): { tel: string; whatsapp: string | null } | null {
  const phone = row.patientPhoneE164 ?? row.patientPhone;
  if (!phone) return null;
  const clinic = clinicName ?? 'la clínica';
  return {
    tel: telHref(phone),
    whatsapp: row.patientPhoneE164
      ? whatsAppUrl(
          row.patientPhoneE164.replace(/^\+/, ''),
          `Hola, ${row.patientFirstName}, te escribimos de ${clinic} para agendar tu control de ortodoncia. ¿Qué día te viene bien?`,
        )
      : null,
  };
}

/** El tipo de cita de ortodoncia de la clínica (por su nombre), si lo tiene. */
export function orthoAppointmentTypeId(
  types: readonly { id: string; name: string; active?: boolean }[] | null,
): string | null {
  return types?.find((t) => t.active !== false && /ortodon/i.test(t.name))?.id ?? null;
}

export { getOrthoSettings, orthoEnabled, useOrthoSettings, type OrthoSettingsState } from './ortho-settings';
