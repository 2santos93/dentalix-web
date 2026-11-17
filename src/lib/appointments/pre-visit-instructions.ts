/**
 * DX-564: indicaciones previas a la cita por tipo de cita («Ven en ayunas…»).
 * Texto general de la clínica por tipo de cita (no dato del paciente), una
 * variante por idioma de los pacientes. Siempre se pinta como TEXTO
 * (`whitespace-pre-line break-words`), nunca como HTML.
 */
export interface PreVisitInstruction {
  language: string;
  text: string;
}

/** Idioma de la clínica: el respaldo cuando no hay variante para el paciente. */
export const PRE_VISIT_CLINIC_LANGUAGE = 'es';

/** Tope por idioma (code points, como la API). */
export const PRE_VISIT_TEXT_MAX = 600;

/** Mensajes de la API (`appointment-type-rules.ts`): los mismos para la validación local. */
export const PRE_VISIT_MESSAGES = {
  tooLong: `Las indicaciones no pueden tener más de ${PRE_VISIT_TEXT_MAX} caracteres.`,
  noLinks: 'Las indicaciones no admiten enlaces ni HTML: escríbelas como texto.',
  notOffered: 'Ese idioma no está entre los idiomas de los pacientes de la clínica.',
  repeated: 'Ese idioma está repetido en las indicaciones.',
  tooMany: 'Las indicaciones admiten como mucho 10 idiomas.',
  tooLarge: 'Las indicaciones son demasiado largas en conjunto: acorta alguno de los idiomas.',
} as const;

/** `http://`, `https://`, `www.` o algo con aspecto de etiqueta: la misma expresión que la API. */
const LINK_OR_HTML = /https?:\/\/|www\.|<\s*\/?\s*[a-z!][^<>]*>/i;

/** El texto como lo guarda la API: `\n`, tabuladores como espacio, sin controles, recortado. */
export function normalizePreVisitText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[\p{Cc}\u2028\u2029]/gu, (c) => (c === '\n' ? c : ''))
    .trim();
}

/** Longitud en caracteres (code points), la que cuenta la API. */
export function preVisitTextLength(text: string): number {
  return [...text].length;
}

/**
 * Error de un campo antes de enviar (el mismo texto que daría la API), o
 * `null`. Un texto vacío no es error: se descarta.
 */
export function preVisitTextError(text: string): string | null {
  const normalized = normalizePreVisitText(text);
  if (normalized === '') return null;
  if (preVisitTextLength(normalized) > PRE_VISIT_TEXT_MAX) return PRE_VISIT_MESSAGES.tooLong;
  if (LINK_OR_HTML.test(normalized)) return PRE_VISIT_MESSAGES.noLinks;
  return null;
}

/**
 * La variante para el idioma del paciente, con la misma regla que la API
 * (`resolveLocalizedText`): exacta → idioma base (`en-GB` → `en`) → español
 * (idioma de la clínica) → nada. `null` = idioma de la clínica.
 */
export function resolvePreVisitInstruction(
  variants: readonly PreVisitInstruction[] | null | undefined,
  language: string | null | undefined,
): PreVisitInstruction | null {
  if (!variants?.length) return null;
  const withText = variants.filter((v) => v.text.trim() !== '');
  const find = (tag: string) => withText.find((v) => v.language.toLowerCase() === tag.toLowerCase()) ?? null;
  const wanted = language?.trim() || PRE_VISIT_CLINIC_LANGUAGE;
  return (
    find(wanted) ??
    find(wanted.split('-')[0]) ??
    find(PRE_VISIT_CLINIC_LANGUAGE)
  );
}

/** El orden de la API: español primero, luego alfabético. */
export function sortPreVisitInstructions<T extends { language: string }>(variants: readonly T[]): T[] {
  return [...variants].sort((a, b) => {
    if (a.language === PRE_VISIT_CLINIC_LANGUAGE) return -1;
    if (b.language === PRE_VISIT_CLINIC_LANGUAGE) return 1;
    return a.language.localeCompare(b.language);
  });
}

/** Rótulo del bloque, como en el recordatorio por email y en WhatsApp (catálogo es/en; otro idioma → es). */
export const PRE_VISIT_LEAD: Record<'es' | 'en', string> = {
  es: 'Antes de tu cita:',
  en: 'Before your appointment:',
};

export function preVisitLead(language: string | null | undefined): string {
  const base = (language ?? PRE_VISIT_CLINIC_LANGUAGE).toLowerCase().split('-')[0];
  return base === 'en' ? PRE_VISIT_LEAD.en : PRE_VISIT_LEAD.es;
}
