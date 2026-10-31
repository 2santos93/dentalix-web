import { apiFetch, apiFetchOrNull } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { documentText, dtoDocTypeName } from './doc-type';

// DX-203: responsables de pago y avisos. Las formas salen del Swagger.
export type PatientResponsibles = components['schemas']['PatientResponsiblesDto'];
export type ResponsibleParty = components['schemas']['ResponsiblePartyDto'];
export type ResponsibleFor = components['schemas']['ResponsibleForDto'];
export type ResponsibleRelationship = components['schemas']['ResponsibleRelationship'];
export type CreateResponsiblePartyInput = components['schemas']['CreateResponsiblePartyDto'];
export type UpdateResponsiblePartyInput = components['schemas']['UpdateResponsiblePartyDto'];

export const RELATIONSHIPS: ResponsibleRelationship[] = [
  'MOTHER',
  'FATHER',
  'LEGAL_GUARDIAN',
  'GRANDPARENT',
  'SIBLING',
  'SPOUSE',
  'CHILD',
  'OTHER',
];

export const RELATIONSHIP_LABELS: Record<ResponsibleRelationship, string> = {
  MOTHER: 'Madre',
  FATHER: 'Padre',
  LEGAL_GUARDIAN: 'Tutor legal',
  GRANDPARENT: 'Abuelo/a',
  SIBLING: 'Hermano/a',
  SPOUSE: 'Cónyuge o pareja',
  CHILD: 'Hijo/a',
  OTHER: 'Otro',
};

const base = (patientId: string) =>
  `/patients/${encodeURIComponent(patientId)}/responsible-parties`;

/** `GET /patients/:id/responsible-parties` — los 4 roles. */
export function getPatientResponsibles(
  token: string,
  patientId: string,
): Promise<PatientResponsibles> {
  return apiFetch<PatientResponsibles>(base(patientId), { token });
}

/** `POST` — un paciente de la clínica (`responsiblePatientId`) o un contacto. */
export function createResponsibleParty(
  token: string,
  patientId: string,
  input: CreateResponsiblePartyInput,
): Promise<ResponsibleParty> {
  return apiFetch<ResponsibleParty>(base(patientId), { method: 'POST', body: input, token });
}

export function updateResponsibleParty(
  token: string,
  patientId: string,
  partyId: string,
  input: UpdateResponsiblePartyInput,
): Promise<ResponsibleParty> {
  return apiFetch<ResponsibleParty>(`${base(patientId)}/${encodeURIComponent(partyId)}`, {
    method: 'PATCH',
    body: input,
    token,
  });
}

export async function removeResponsibleParty(
  token: string,
  patientId: string,
  partyId: string,
): Promise<void> {
  // 204 sin cuerpo.
  await apiFetchOrNull<null>(`${base(patientId)}/${encodeURIComponent(partyId)}`, {
    method: 'DELETE',
    token,
  });
}

/**
 * «{nombre visible} {número}» (R8, con el `docTypeName` del DTO), solo el
 * número si no hay tipo, o null.
 */
export function partyDocument(
  party: Pick<ResponsibleParty, 'docType' | 'docTypeLabel' | 'docTypeName' | 'docNumber'>,
): string | null {
  if (!party.docNumber) return null;
  if (!party.docType) return party.docNumber;
  return documentText(
    dtoDocTypeName({
      docType: party.docType,
      docTypeLabel: party.docTypeLabel,
      docTypeName: party.docTypeName,
    }),
    party.docNumber,
  );
}

const GUARDIAN_RELATIONSHIPS: ResponsibleRelationship[] = ['LEGAL_GUARDIAN', 'MOTHER', 'FATHER'];

/**
 * El responsable que firma un consentimiento como tutor (DX-006): primero
 * tutor legal, madre o padre (el pagador antes), luego el pagador y si no el
 * primero. null sin responsables.
 */
export function consentGuardian(parties: readonly ResponsibleParty[]): ResponsibleParty | null {
  const byPayer = [...parties].sort((a, b) => Number(b.isPayer) - Number(a.isPayer));
  return (
    byPayer.find((p) => GUARDIAN_RELATIONSHIPS.includes(p.relationship)) ?? byPayer[0] ?? null
  );
}
