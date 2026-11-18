import {
  hasLinkOrHtml,
  normalizePreVisitText,
  preVisitTextLength,
  sortPreVisitInstructions,
} from '@/lib/appointments/pre-visit-instructions';
import type { PatientDescriptionEntry } from './catalog-api';

/**
 * DX-560: «Descripción para el paciente» de un procedimiento del catálogo, un
 * texto por idioma de los pacientes de la clínica. Es la misma regla de texto
 * plano que las indicaciones previas a la cita (DX-564, la API la comparte en
 * `src/shared/i18n/patient-plain-text.ts`): se normaliza igual, se cuenta en
 * caracteres y no admite enlaces, dominios, IP, email ni HTML. Siempre se
 * pinta como texto.
 */

/** Idioma de la clínica: siempre se ofrece. */
export const PATIENT_DESCRIPTION_CLINIC_LANGUAGE = 'es';

/** Tope por idioma (caracteres tras normalizar, como la API). */
export const PATIENT_DESCRIPTION_MAX = 300;

/** Tope del mapa entero en JSON (el CHECK de la BD, la API responde 400). */
export const PATIENT_DESCRIPTION_TOTAL_BYTES_MAX = 8000;

/** Los 400 de la API (`dental-catalog`), los mismos para la validación local. */
export const PATIENT_DESCRIPTION_MESSAGES = {
  tooLong: `La descripción para el paciente no puede tener más de ${PATIENT_DESCRIPTION_MAX} caracteres.`,
  noLinks: 'La descripción para el paciente no admite enlaces ni HTML: escríbela como texto.',
  notOffered: 'Ese idioma no está entre los idiomas de los pacientes de la clínica.',
  repeated: 'Ese idioma está repetido en la descripción para el paciente.',
  tooMany: 'La descripción para el paciente admite como mucho 10 idiomas.',
  tooLarge: 'La descripción para el paciente es demasiado larga en conjunto: acorta alguno de los idiomas.',
} as const;

/** Mensajes de la API que se refieren al texto de un idioma (van junto a su campo). */
const TEXT_MESSAGES = new Set<string>([PATIENT_DESCRIPTION_MESSAGES.tooLong, PATIENT_DESCRIPTION_MESSAGES.noLinks]);
/** Mensajes de la API que se refieren al idioma en sí. */
const LANGUAGE_MESSAGES = new Set<string>([
  PATIENT_DESCRIPTION_MESSAGES.notOffered,
  PATIENT_DESCRIPTION_MESSAGES.repeated,
]);

export const normalizePatientDescription = normalizePreVisitText;
export const patientDescriptionLength = preVisitTextLength;

/** Error de un campo antes de enviar (el texto de la API), o `null`. Un texto vacío se descarta, no es error. */
export function patientDescriptionError(text: string): string | null {
  const normalized = normalizePatientDescription(text);
  if (normalized === '') return null;
  if (patientDescriptionLength(normalized) > PATIENT_DESCRIPTION_MAX) return PATIENT_DESCRIPTION_MESSAGES.tooLong;
  if (hasLinkOrHtml(normalized)) return PATIENT_DESCRIPTION_MESSAGES.noLinks;
  return null;
}

/** Bytes UTF-8 de un texto (sin `TextEncoder`, que jsdom no trae). */
function utf8Bytes(text: string): number {
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0)!;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/** ¿El mapa entero pasa del tope conjunto de la API? */
export function patientDescriptionTooLarge(entries: readonly PatientDescriptionEntry[]): boolean {
  const map = Object.fromEntries(entries.map((e) => [e.language, normalizePatientDescription(e.text)]));
  return utf8Bytes(JSON.stringify(map)) > PATIENT_DESCRIPTION_TOTAL_BYTES_MAX;
}

/** El orden de la API: español primero, luego alfabético. */
export function sortLanguages(languages: readonly string[]): string[] {
  return sortPreVisitInstructions([...new Set(languages)].map((language) => ({ language }))).map((v) => v.language);
}

/**
 * Los idiomas que se editan: español y los de la clínica. Mientras la lista
 * de la clínica carga (o si falla), español y los que ya tienen texto: la API
 * valida igualmente.
 */
export function offeredLanguages(clinicLanguages: readonly string[] | null, saved: readonly string[]): string[] {
  return sortLanguages([PATIENT_DESCRIPTION_CLINIC_LANGUAGE, ...(clinicLanguages ?? saved)]);
}

/** La lista ENTERA que se envía: los ofrecidos con texto y los retirados tal cual se guardaron. */
export function patientDescriptionPayload(
  texts: Readonly<Record<string, string>>,
  languages: readonly string[],
): PatientDescriptionEntry[] {
  return languages
    .map((language) => ({ language, text: texts[language] ?? '' }))
    .filter((entry) => normalizePatientDescription(entry.text) !== '');
}

/**
 * El idioma junto a cuyo campo va un 400 de la API, si se puede saber: el
 * texto con enlaces o largo → el primero que lo incumple; el idioma no
 * ofrecido o repetido → el primero editable fuera de la lista de la clínica.
 */
export function languageForApiError(
  message: string,
  sent: readonly PatientDescriptionEntry[],
  offered: readonly string[],
  clinicLanguages: readonly string[] | null,
): string | null {
  const editable = sent.filter((v) => offered.includes(v.language));
  if (TEXT_MESSAGES.has(message)) {
    return (editable.find((v) => patientDescriptionError(v.text) !== null) ?? editable[0])?.language ?? null;
  }
  if (LANGUAGE_MESSAGES.has(message)) {
    const byClinic = clinicLanguages ?? [];
    return (
      editable.find((v) => v.language !== PATIENT_DESCRIPTION_CLINIC_LANGUAGE && !byClinic.includes(v.language))
        ?.language ??
      editable[0]?.language ??
      null
    );
  }
  return null;
}

/** ¿Es un 400 de la descripción (para no confundirlo con el resto del formulario)? */
export function isPatientDescriptionMessage(message: string): boolean {
  return /descripción para el paciente/i.test(message) || LANGUAGE_MESSAGES.has(message);
}
