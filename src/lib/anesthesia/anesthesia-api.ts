import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

/**
 * Anestesia local en la evolución (DX-307). El SERVIDOR calcula los mg, el
 * acumulado de la evolución y la fracción de la dosis máxima por peso; la web
 * solo lo enseña. Los registros son inalterables (corrección por adenda).
 */
export type AnestheticProduct = components['schemas']['AnestheticProductDto'];
export type AnesthesiaTechnique = components['schemas']['AnesthesiaTechnique'];
export type AnesthesiaAdministration = components['schemas']['AnesthesiaAdministrationDto'];
export type RecordedAnesthesia = components['schemas']['RecordedAnesthesiaDto'];
export type AnesthesiaDoseSummary = components['schemas']['AnesthesiaDoseSummaryDto'];
export type AnesthesiaCheck = components['schemas']['AnesthesiaCheckDto'];
export type EntryAnesthesia = components['schemas']['EntryAnesthesiaDto'];
export type DoseAlert = components['schemas']['DoseAlertDto'];
export type RecordAnesthesiaInput = components['schemas']['RecordAnesthesiaDto'];
export type AnesthesiaDoseCheckInput = components['schemas']['AnesthesiaDoseCheckDto'];

/** Topes que repite la API. */
export const OVERRIDE_REASON_MIN = 10;
export const OVERRIDE_REASON_MAX = 500;
export const CARPULE_STEP = 0.25;
export const CARPULES_MAX = 20;
/** Menores de esta edad: la dosis máxima se calcula por peso (hay que anotarlo). */
export const PEDIATRIC_AGE_LIMIT = 12;

export const TECHNIQUE_LABELS: Record<AnesthesiaTechnique, string> = {
  INFILTRATION: 'Infiltrativa',
  NERVE_BLOCK: 'Troncular',
  INTRALIGAMENTARY: 'Intraligamentosa',
  INTRAPULPAL: 'Intrapulpar',
  INTRAOSSEOUS: 'Intraósea',
};

const entryPath = (patientId: string, entryId: string) =>
  `/patients/${patientId}/clinical-entries/${entryId}/anesthesia`;

export function listAnesthetics(
  token: string,
  includeInactive = false,
): Promise<AnestheticProduct[]> {
  return apiFetch<AnestheticProduct[]>(
    includeInactive ? '/anesthetics?includeInactive=true' : '/anesthetics',
    { token },
  );
}

/** «Cargar anestésicos sugeridos» (solo ADMIN): crea los que faltan. */
export function loadSampleAnesthetics(token: string): Promise<AnestheticProduct[]> {
  return apiFetch<AnestheticProduct[]>('/anesthetics/samples', {
    method: 'POST',
    token,
  });
}

export function getEntryAnesthesia(
  token: string,
  patientId: string,
  entryId: string,
): Promise<EntryAnesthesia> {
  return apiFetch<EntryAnesthesia>(entryPath(patientId, entryId), { token });
}

export function listPatientAnesthesia(
  token: string,
  patientId: string,
): Promise<AnesthesiaAdministration[]> {
  return apiFetch<AnesthesiaAdministration[]>(`/patients/${patientId}/anesthesia`, {
    token,
  });
}

export function checkAnesthesiaDose(
  token: string,
  patientId: string,
  entryId: string,
  input: AnesthesiaDoseCheckInput,
): Promise<AnesthesiaCheck> {
  return apiFetch<AnesthesiaCheck>(`${entryPath(patientId, entryId)}/check`, {
    method: 'POST',
    body: input,
    token,
  });
}

export function recordAnesthesia(
  token: string,
  patientId: string,
  entryId: string,
  input: RecordAnesthesiaInput,
): Promise<RecordedAnesthesia> {
  return apiFetch<RecordedAnesthesia>(entryPath(patientId, entryId), {
    method: 'POST',
    body: input,
    token,
  });
}

/**
 * Carpules escritos en el sillón: «1,5», «1.5», «2». Múltiplos de 0,25 entre
 * 0,25 y 20; cualquier otra cosa es `null` (el formulario dice por qué).
 */
export function parseCarpules(text: string): number | null {
  const clean = text.trim().replace(',', '.');
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(clean)) return null;
  const value = Number(clean);
  if (value < CARPULE_STEP || value > CARPULES_MAX) return null;
  return Number.isInteger(value / CARPULE_STEP) ? value : null;
}

/** Peso en kg con hasta un decimal (coma o punto), entre 0,1 y 399. */
export function parseWeightKg(text: string): number | null {
  const clean = text.trim().replace(',', '.');
  if (!/^\d{1,3}(\.\d)?$/.test(clean)) return null;
  const value = Number(clean);
  return value > 0 && value < 400 ? value : null;
}

/** «1,5» / «72» con coma decimal, como el resto de la ficha. */
export function formatDecimal(value: number): string {
  return String(Math.round(value * 100) / 100).replace('.', ',');
}
