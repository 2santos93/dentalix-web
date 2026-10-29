import { normalizeDocType } from './legacy-doc-type';
import type { DocType } from './patients-api';

/**
 * DX-327: tipos de documento del paciente, iguales para cualquier clínica y
 * sin país (spec R2). El nombre que ve cada clínica sale de `documentTypeName`
 * (R17), el único resolvedor de la web; los códigos anteriores viven solo en
 * `legacy-doc-type.ts`.
 */
export const DOC_TYPES: readonly DocType[] = [
  'NATIONAL_ID',
  'PASSPORT',
  'RESIDENCE_PERMIT',
  'TAX_ID',
  'OTHER',
];

/** R2: nombre genérico de cada tipo, igual que en la API. */
export const DOC_TYPE_LABEL: Readonly<Record<DocType, string>> = {
  NATIONAL_ID: 'Documento nacional',
  PASSPORT: 'Pasaporte',
  RESIDENCE_PERMIT: 'Permiso de residencia',
  TAX_ID: 'Identificación fiscal',
  OTHER: 'Otro documento',
};

/** R7: nombre libre del documento de un paciente. */
export const DOC_TYPE_LABEL_MAX = 40;
/** R16: nombre local de un tipo en la clínica. */
export const DOC_TYPE_NAME_MAX = 60;

/** R16: nombres locales de la clínica; ausente o null = sin nombre local. */
export type ClinicDocumentTypeNames = Readonly<Partial<Record<DocType, string | null>>>;

/**
 * R17: etiqueta del paciente, si no el nombre local de la clínica para su
 * tipo, si no el genérico. Un código que no es genérico se normaliza; si
 * tampoco se reconoce, se pinta tal cual.
 */
export function documentTypeName(
  type: string,
  label: string | null | undefined,
  clinicNames: ClinicDocumentTypeNames,
): string {
  if (label) return label;
  const generic = normalizeDocType(type);
  if (!generic) return type;
  const local = Object.hasOwn(clinicNames, generic) ? clinicNames[generic] : null;
  return local || DOC_TYPE_LABEL[generic];
}

/** R8: «{nombre} {número}», o null sin número. */
export function documentText(name: string, number: string | null): string | null {
  return number ? `${name} ${number}` : null;
}

/** Texto de una opción de los selects: el nombre local o el genérico. */
export function docTypeOptionLabel(type: DocType, clinicNames: ClinicDocumentTypeNames): string {
  return documentTypeName(type, null, clinicNames);
}

/**
 * §6.4: el `docTypeName` que resolvió la API; si falta (API anterior en el
 * hueco del despliegue), la etiqueta del paciente o el genérico.
 */
export function dtoDocTypeName(dto: {
  docType: string;
  docTypeLabel?: string | null;
  docTypeName?: string | null;
}): string {
  return dto.docTypeName || documentTypeName(dto.docType, dto.docTypeLabel, {});
}
