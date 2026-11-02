import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';
import { DOC_TYPES } from './doc-type';
import type { DocType } from './patients-api';

/** R16: nombre local de cada tipo en la clínica; null = se usa el genérico. */
export type DocumentTypeNames = Record<DocType, string | null>;
type DocumentTypeNamesDto = components['schemas']['DocumentTypeNamesDto'];
type DocumentTypeNamesViewDto = components['schemas']['DocumentTypeNamesViewDto'];

/** Los nombres de la clínica los cambia solo ADMIN (la API también lo exige). */
export function canManageDocumentTypeNames(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/** Los cinco tipos, con null para los que la API no mande. */
function fromValues(values: DocumentTypeNamesDto['names']): DocumentTypeNames {
  return Object.fromEntries(DOC_TYPES.map((t) => [t, values[t] ?? null])) as DocumentTypeNames;
}

function fromDto(dto: DocumentTypeNamesDto): DocumentTypeNames {
  return fromValues(dto.names);
}

/**
 * `GET /patients/document-type-names` (cualquier rol). Los formularios lo
 * piden al abrirse y, si falla, siguen con los genéricos sin bloquear.
 *
 * DX-524: son los nombres que rigen en la sede activa (los de la sede sobre los
 * de la clínica, por tipo): así un select escribe el tipo como lo escribe esa
 * sede. Una API anterior no trae `effective`: valen los de la clínica. Para
 * editar los de la clínica, `getClinicDocumentTypeNames`.
 */
export async function getDocumentTypeNames(token: string): Promise<DocumentTypeNames> {
  const dto = await apiFetch<DocumentTypeNamesViewDto>('/patients/document-type-names', { token });
  return fromValues(dto.effective ?? dto.names);
}

/**
 * DX-524: solo los nombres de la CLÍNICA (`names`), sin los de la sede activa:
 * lo que edita Ajustes › Documentos y lo que una sede hereda.
 */
export async function getClinicDocumentTypeNames(token: string): Promise<DocumentTypeNames> {
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
