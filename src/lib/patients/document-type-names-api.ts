import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';
import { DOC_TYPES } from './doc-type';
import type { DocType } from './patients-api';

/** R16: nombre local de cada tipo en la clínica; null = se usa el genérico. */
export type DocumentTypeNames = Record<DocType, string | null>;
type DocumentTypeNamesDto = components['schemas']['DocumentTypeNamesDto'];

/** Los nombres de la clínica los cambia solo ADMIN (la API también lo exige). */
export function canManageDocumentTypeNames(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/** Los cinco tipos, con null para los que la API no mande. */
function fromDto(dto: DocumentTypeNamesDto): DocumentTypeNames {
  return Object.fromEntries(DOC_TYPES.map((t) => [t, dto.names[t] ?? null])) as DocumentTypeNames;
}

/**
 * `GET /patients/document-type-names` (cualquier rol). Los formularios lo
 * piden al abrirse y, si falla, siguen con los genéricos sin bloquear.
 */
export async function getDocumentTypeNames(token: string): Promise<DocumentTypeNames> {
  return fromDto(await apiFetch<DocumentTypeNamesDto>('/patients/document-type-names', { token }));
}

/** `PUT`: sustituye los cinco (null = sin nombre local). */
export async function updateDocumentTypeNames(
  token: string,
  names: DocumentTypeNames,
): Promise<DocumentTypeNames> {
  const body: DocumentTypeNamesDto = { names };
  return fromDto(
    await apiFetch<DocumentTypeNamesDto>('/patients/document-type-names', {
      method: 'PUT',
      body,
      token,
    }),
  );
}
