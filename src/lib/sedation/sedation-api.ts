import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

/**
 * Hoja de sedación consciente en la evolución (DX-407). El SERVIDOR valida
 * cada parte con la plantilla de la hoja (hoy la de plataforma; DX-409 la hará
 * por clínica) y calcula el IMC, los reversores por peso y el aviso de
 * intervalo sin toma; la web lo enseña. Todo es inalterable: una corrección va
 * en una adenda de la evolución.
 */
export type EntrySedation = components['schemas']['EntrySedationDto'];
export type SedationSheet = components['schemas']['SedationSheetDto'];
export type SedationTemplate = components['schemas']['SedationTemplateDto'];
export type SedationWatch = components['schemas']['SedationVitalsWatchDto'];
export type SedationVitalsRow = components['schemas']['SedationVitalsRowDto'];
export type SedationAgentRow = components['schemas']['SedationAgentRowDto'];
export type SedationAssessmentInput = components['schemas']['SedationAssessmentDto'];
export type SedationAgentInput = components['schemas']['SedationAgentDto'];
export type SedationVitalsInput = components['schemas']['SedationVitalsDto'];
export type SedationVitalsValues = components['schemas']['SedationVitalsValuesDto'];
export type SedationDischargeInput = components['schemas']['SedationDischargeDto'];
export type SedationGrade = components['schemas']['SedationGrade'];
export type AsaClass = components['schemas']['AsaClass'];
export type SedationLevel = components['schemas']['SedationLevel'];
export type SedationAgentKind = components['schemas']['SedationAgentKind'];
export type SedationRoute = components['schemas']['SedationRoute'];
export type SedationDoseUnit = components['schemas']['SedationDoseUnit'];
export type SedationVitalsPhase = components['schemas']['SedationVitalsPhase'];
export type SedationStatus = SedationSheet['status'];

/** Mínimo de una justificación o interconsulta (lo repite la API). */
export const SEDATION_REASON_MIN = 10;
/** ASA desde la que hace falta interconsulta o justificación. */
export const HIGH_ASA: readonly AsaClass[] = ['III', 'IV', 'V'];

export const GRADE_LABELS: Record<SedationGrade, string> = {
  MINIMAL: 'Mínima (ansiolisis)',
  MODERATE: 'Moderada (consciente)',
};

export const ASA_CLASSES: readonly AsaClass[] = ['I', 'II', 'III', 'IV', 'V'];

export const LEVEL_LABELS: Record<SedationLevel, string> = {
  AWAKE: 'Despierto',
  MINIMAL: 'Mínima',
  MODERATE: 'Moderada',
  DEEP: 'Profunda',
};

export const PHASE_LABELS: Record<SedationVitalsPhase, string> = {
  BASELINE: 'Basal',
  INTRA: 'Intraoperatoria',
  DISCHARGE: 'Al alta',
};

export const AGENT_KIND_LABELS: Record<SedationAgentKind, string> = {
  NITROUS_OXIDE: 'Óxido nitroso (N₂O)',
  ORAL: 'Oral',
  OTHER: 'Otro',
};

export const ROUTE_LABELS: Record<SedationRoute, string> = {
  INHALED: 'Inhalada',
  ORAL: 'Oral',
  SUBLINGUAL: 'Sublingual',
  INTRANASAL: 'Intranasal',
  INTRAMUSCULAR: 'Intramuscular',
  INTRAVENOUS: 'Intravenosa',
  SUBMUCOSAL: 'Submucosa',
};

export const DOSE_UNIT_LABELS: Record<SedationDoseUnit, string> = {
  MG: 'mg',
  MCG: 'mcg',
  ML: 'ml',
};

export const STATUS_LABELS: Record<SedationStatus, string> = {
  ASSESSED: 'Valorada',
  CHECKED: 'Checklist hecho',
  IN_PROGRESS: 'En curso',
  DISCHARGED: 'Egreso firmado',
};

const entryPath = (patientId: string, entryId: string) =>
  `/patients/${patientId}/clinical-entries/${entryId}/sedation`;

export function getEntrySedation(
  token: string,
  patientId: string,
  entryId: string,
): Promise<EntrySedation> {
  return apiFetch<EntrySedation>(entryPath(patientId, entryId), { token });
}

export function listPatientSedation(token: string, patientId: string): Promise<SedationSheet[]> {
  return apiFetch<SedationSheet[]>(`/patients/${patientId}/sedation`, { token });
}

function post<T>(token: string, path: string, body: T): Promise<SedationSheet> {
  return apiFetch<SedationSheet>(path, { method: 'POST', body, token });
}

export function assessSedation(
  token: string,
  patientId: string,
  entryId: string,
  input: SedationAssessmentInput,
): Promise<SedationSheet> {
  return post(token, entryPath(patientId, entryId), input);
}

export function recordSedationChecklist(
  token: string,
  patientId: string,
  entryId: string,
  items: { code: string; checked: boolean }[],
  /** Hora del checklist (ISO); sin ella, el servidor usa «ahora». */
  checkedAt?: string,
): Promise<SedationSheet> {
  return post(token, `${entryPath(patientId, entryId)}/checklist`, {
    items,
    ...(checkedAt ? { checkedAt } : {}),
  });
}

export function recordSedationAgent(
  token: string,
  patientId: string,
  entryId: string,
  input: SedationAgentInput,
): Promise<SedationSheet> {
  return post(token, `${entryPath(patientId, entryId)}/agents`, input);
}

export function recordSedationVitals(
  token: string,
  patientId: string,
  entryId: string,
  input: SedationVitalsInput,
): Promise<SedationSheet> {
  return post(token, `${entryPath(patientId, entryId)}/vitals`, input);
}

export function dischargeSedation(
  token: string,
  patientId: string,
  entryId: string,
  input: SedationDischargeInput,
): Promise<SedationSheet> {
  return post(token, `${entryPath(patientId, entryId)}/discharge`, input);
}

/**
 * Número escrito en el sillón («18,5», «18.5», «2»): con como mucho
 * `decimals` decimales y dentro de [min, max]. `undefined` si está vacío;
 * `null` si no vale (el formulario dice por qué).
 */
export function parseNumber(
  text: string,
  { min, max, decimals = 0 }: { min: number; max: number; decimals?: number },
): number | null | undefined {
  const clean = text.trim().replace(',', '.');
  if (clean === '') return undefined;
  const pattern = decimals > 0 ? new RegExp(`^\\d{1,5}(\\.\\d{1,${decimals}})?$`) : /^\d{1,5}$/;
  if (!pattern.test(clean)) return null;
  const value = Number(clean);
  return value >= min && value <= max ? value : null;
}

/** IMC = kg / m² a un decimal (el mismo cálculo que guarda el servidor). */
export function bodyMassIndex(weightKg: number | undefined | null, heightCm: number | undefined | null): number | null {
  if (!weightKg || !heightCm) return null;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

/** Naloxona 0,1 mg/kg (máx. 2 mg) y flumazenil 0,01 mg/kg (máx. 0,2 mg). */
export function reversalDoses(
  weightKg: number | undefined | null,
): { naloxoneMg: number; flumazenilMg: number } | null {
  if (!weightKg) return null;
  return {
    naloxoneMg: Math.round(Math.min(0.1 * weightKg, 2) * 100) / 100,
    flumazenilMg: Math.round(Math.min(0.01 * weightKg, 0.2) * 1000) / 1000,
  };
}

/** «1,5» con coma decimal, como el resto de la ficha. */
export function formatDecimal(value: number): string {
  return String(Math.round(value * 1000) / 1000).replace('.', ',');
}

/**
 * Aviso del intervalo, recalculado con el reloj del navegador a partir de lo
 * que dijo el servidor (`nextDueAt`): así el aviso aparece sin recargar
 * cuando pasa el intervalo con el modal abierto.
 */
export function liveOverdue(
  watch: SedationWatch,
  now: Date,
): { overdue: boolean; overdueMinutes: number } {
  if (!watch.active || !watch.nextDueAt) return { overdue: false, overdueMinutes: 0 };
  const late = now.getTime() - new Date(watch.nextDueAt).getTime();
  return late > 0
    ? { overdue: true, overdueMinutes: Math.floor(late / 60_000) }
    : { overdue: false, overdueMinutes: 0 };
}
