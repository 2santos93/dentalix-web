import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';
import { canWriteClinicalHistory } from '@/lib/clinical/clinical-roles';

/*
 * «Copia de la historia clínica» de un paciente (DX-456): un período (días
 * civiles de la sede, ambos incluidos) y las secciones elegidas. Generarla deja
 * un registro y un evento EXPORT en la API; el documento se pide aparte para la
 * vista imprimible (cada lectura queda como impresión). Tipos del OpenAPI.
 */

type Schemas = components['schemas'];

export type ClinicalRecordCopySection = Schemas['ClinicalRecordCopySummaryDto']['sections'][number];
export type ClinicalRecordCopySummary = Schemas['ClinicalRecordCopySummaryDto'];
export type ClinicalRecordCopyDocument = Schemas['ClinicalRecordCopyDocumentDto'];
export type ClinicalRecordCopyContent = Schemas['CopyContentDto'];
export type CopyEvolution = Schemas['CopyEvolutionDto'];
export type CopyAnamnesis = Schemas['CopyAnamnesisDto'];

/** Las secciones en el orden del documento, con su nombre en pantalla y en papel. */
export const CLINICAL_RECORD_COPY_SECTIONS: readonly { id: ClinicalRecordCopySection; label: string }[] = [
  { id: 'EVOLUTIONS', label: 'Evoluciones y adendas' },
  { id: 'DIAGNOSES', label: 'Diagnósticos' },
  { id: 'ANAMNESIS', label: 'Anamnesis' },
  { id: 'ODONTOGRAM', label: 'Odontograma' },
  { id: 'ANESTHESIA_SEDATION', label: 'Anestesia y sedación' },
  { id: 'CONSENTS', label: 'Consentimientos firmados' },
  { id: 'PRESCRIPTIONS', label: 'Recetas' },
  { id: 'APPOINTMENTS', label: 'Citas' },
];

const SECTION_LABEL = new Map(CLINICAL_RECORD_COPY_SECTIONS.map((s) => [s.id, s.label]));

export function sectionLabel(section: ClinicalRecordCopySection): string {
  return SECTION_LABEL.get(section) ?? section;
}

/** «Evoluciones y adendas, Recetas» — o «Todas las secciones». */
export function sectionsSummary(sections: readonly ClinicalRecordCopySection[]): string {
  if (sections.length === CLINICAL_RECORD_COPY_SECTIONS.length) return 'Todas las secciones';
  return CLINICAL_RECORD_COPY_SECTIONS.filter((s) => sections.includes(s.id))
    .map((s) => s.label)
    .join(', ');
}

/** Tope de «Entregado a» (el de la API). */
export const DELIVERED_TO_MAX = 120;

/** Quién genera la copia: los roles clínicos y ADMIN (la API vuelve a exigirlo). */
export function canGenerateClinicalRecordCopy(role: ClinicRole | null): boolean {
  return canWriteClinicalHistory(role);
}

export interface NewClinicalRecordCopy {
  from: string;
  to: string;
  sections: ClinicalRecordCopySection[];
  deliveredTo?: string | null;
}

function copiesPath(patientId: string): string {
  return `/patients/${encodeURIComponent(patientId)}/clinical-record-copies`;
}

/** `GET …/clinical-record-copies`: generaciones anteriores, la más reciente primero. */
export function listClinicalRecordCopies(token: string, patientId: string): Promise<ClinicalRecordCopySummary[]> {
  return apiFetch<ClinicalRecordCopySummary[]>(copiesPath(patientId), { token });
}

/**
 * `POST …/clinical-record-copies`: genera la copia (evento EXPORT en la API).
 * 400 en español si el período o las secciones no valen; 403 para un rol no
 * clínico o una sede no permitida; 404 si el paciente no es de la clínica.
 */
export function generateClinicalRecordCopy(
  token: string,
  patientId: string,
  input: NewClinicalRecordCopy,
): Promise<ClinicalRecordCopySummary> {
  return apiFetch<ClinicalRecordCopySummary>(copiesPath(patientId), {
    method: 'POST',
    token,
    body: {
      from: input.from,
      to: input.to,
      sections: input.sections,
      deliveredTo: input.deliveredTo?.trim() || null,
    },
  });
}

/** `GET …/:copyId/document`: el documento para imprimir (queda como impresión). */
export function getClinicalRecordCopyDocument(
  token: string,
  patientId: string,
  copyId: string,
): Promise<ClinicalRecordCopyDocument> {
  return apiFetch<ClinicalRecordCopyDocument>(
    `${copiesPath(patientId)}/${encodeURIComponent(copyId)}/document`,
    { token },
  );
}

/** Vista imprimible de una copia (fuera del shell). */
export function clinicalRecordCopyPrintHref(patientId: string, copyId: string): string {
  return `/print/patients/${encodeURIComponent(patientId)}/clinical-record-copies/${encodeURIComponent(copyId)}`;
}
