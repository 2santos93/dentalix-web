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
/**
 * R7: el nombre libre como lo guarda la API: recortado, con los espacios
 * internos juntados en uno; vacío = null.
 */
export function normalizeDocTypeLabel(raw: string): string | null {
  const label = raw.trim().replace(/\s+/g, ' ');
  return label === '' ? null : label;
}

/**
 * Por qué la API rechazaría un nombre ya normalizado, con su misma regla y en
 * su mismo orden: caracteres de control o de formato (U+200B al copiar de un
 * PDF, U+202E que invierte el texto impreso) o sustitutos sueltos; luego, más
 * caracteres de la cuenta. Cuenta puntos de código, no unidades UTF-16: por
 * eso los campos no llevan `maxLength`, que cortaría antes un nombre con
 * caracteres fuera del plano básico.
 */
export type DocTypeTextError = 'control' | 'tooLong';

const CONTROL_OR_FORMAT = /[\p{Cc}\p{Cf}\p{Cs}]/u;

function textError(text: string | null, max: number): DocTypeTextError | null {
  if (text === null) return null;
  if (CONTROL_OR_FORMAT.test(text)) return 'control';
  return [...text].length > max ? 'tooLong' : null;
}

/** R7: el error que daría la API al nombre libre de un paciente, o null. */
export function docTypeLabelError(raw: string): DocTypeTextError | null {
  return textError(normalizeDocTypeLabel(raw), DOC_TYPE_LABEL_MAX);
}

/** R16: nombre local de un tipo en la clínica. */
export const DOC_TYPE_NAME_MAX = 60;

/** R16: el nombre local como lo guarda la API (igual que R7); vacío = null. */
export function normalizeDocTypeName(raw: string): string | null {
  return normalizeDocTypeLabel(raw);
}

/** Una letra latina seguida de sus marcas combinantes (como en la API). */
const LATIN_MARKS = /(\p{Script=Latin})\p{M}+/gu;

/**
 * R16: el error que daría la API al nombre local de un tipo, o null. Además
 * de R7, la API pide al menos una letra o un número en cualquier escritura:
 * su clave de comparación (`documentTypeKey`, que descompone, quita las
 * marcas de las letras latinas y recompone) no puede quedar vacía.
 */
export function docTypeNameError(raw: string): DocTypeTextError | 'noLetter' | null {
  const name = normalizeDocTypeName(raw);
  const error = textError(name, DOC_TYPE_NAME_MAX);
  if (error || name === null) return error;
  const folded = name.normalize('NFKD').replace(LATIN_MARKS, '$1').normalize('NFC');
  return /[\p{L}\p{N}\p{M}]/u.test(folded) ? null : 'noLetter';
}

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

/** El nombre genérico de un tipo (R2), p. ej. para rotular los ajustes. */
export function genericDocTypeName(type: DocType): string {
  return DOC_TYPE_LABEL[type];
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
