/**
 * Composición del texto de una evolución con plantilla (DX-170), para la vista
 * previa del formulario. Es el mismo algoritmo que la API
 * (`note-template-rules.ts`): un marcador `{{Etiqueta}}` se rellena con la
 * respuesta a la pregunta de esa etiqueta, sin distinguir mayúsculas ni
 * espacios de más, en UNA pasada.
 */

/** Lo que queda en el texto cuando una pregunta se omite o no tiene respuesta. */
export const SKIPPED_ANSWER = '[sin respuesta]';

export interface ComposablePrompt {
  id: string;
  label: string;
  type: 'ONE' | 'MULTI' | 'TEXT';
  options: string[];
  defaultValue: string | null;
}

/** Respuesta en el formulario: lo elegido o escrito, u «Omitir». */
export interface PromptAnswer {
  values: string[];
  skipped: boolean;
}

const MARKER = /\{\{([^{}]*)\}\}/g;
// Caracteres de control salvo salto de línea y tabulador.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function promptKey(label: string): string {
  return label.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
}

/** Respuesta inicial: el valor por defecto de la pregunta, si tiene. */
export function initialAnswer(prompt: ComposablePrompt): PromptAnswer {
  return { values: prompt.defaultValue ? [prompt.defaultValue] : [], skipped: false };
}

/** «a», «a y b», «a, b y c». */
function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

/**
 * Texto con el que una respuesta rellena su marcador. «Omitir» o nada elegido
 * dejan «[sin respuesta]»; MULTI va en el orden de las opciones.
 */
export function answerText(prompt: ComposablePrompt, answer: PromptAnswer | undefined): string {
  if (!answer) return prompt.defaultValue ?? SKIPPED_ANSWER;
  const values = answer.values
    .map((v) => v.replace(CONTROL_CHARS, '').trim())
    .filter((v) => v !== '');
  if (answer.skipped || values.length === 0) return SKIPPED_ANSWER;
  if (prompt.type === 'MULTI') {
    const chosen = new Set(values);
    return listJoin(prompt.options.filter((o) => chosen.has(o)));
  }
  return values[0];
}

/**
 * Sustituye cada marcador por su texto. Lo que trae una respuesta (otro
 * `{{…}}`, `$&`, HTML) se copia literal: nunca se vuelve a interpretar, y
 * React lo pinta como texto.
 */
export function composeNote(
  body: string,
  prompts: ComposablePrompt[],
  answers: Record<string, PromptAnswer>,
): string {
  const byKey = new Map(prompts.map((p) => [promptKey(p.label), answerText(p, answers[p.id])]));
  return body.replace(MARKER, (_match, label: string) => byKey.get(promptKey(label)) ?? SKIPPED_ANSWER);
}
