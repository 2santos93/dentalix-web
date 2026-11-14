/**
 * DX-455: atajos de plantilla en el texto de una evolución nueva. Se escribe
 * `#resina` seguido de un espacio y el atajo se sustituye por el texto de la
 * plantilla activa que lo tenga (sin distinguir mayúsculas). Un atajo que no
 * es de ninguna plantilla activa se queda como texto.
 */

/** El mismo formato que valida la API (`^#[\p{L}\p{M}\p{N}_-]{2,30}$`, NFC). */
export const SHORTCUT_PATTERN = /^#[\p{L}\p{M}\p{N}_-]{2,30}$/u;

/** El texto del 400 de la API, para el aviso previo del cliente. */
export const SHORTCUT_FORMAT_MESSAGE =
  'El atajo empieza por # y lleva de 2 a 30 letras, números, guiones o guiones bajos, sin espacios (p. ej. #resina).';

export function normalizeShortcut(raw: string): string {
  return raw.trim().normalize('NFC');
}

export function isValidShortcut(raw: string): boolean {
  return SHORTCUT_PATTERN.test(normalizeShortcut(raw));
}

function shortcutKey(raw: string): string {
  return normalizeShortcut(raw).toLowerCase();
}

export interface ShortcutTemplate {
  id: string;
  shortcut: string | null;
  active: boolean;
}

export interface ShortcutMatch<T extends ShortcutTemplate> {
  template: T;
  /** Dónde empieza el atajo en el texto. */
  start: number;
  /** Justo después del espacio que lo cerró (la posición del cursor). */
  end: number;
  /** El atajo tal como se escribió (sin el espacio). */
  token: string;
}

/**
 * ¿Lo que acaba de escribirse delante del cursor es «atajo + espacio»? El
 * atajo empieza al principio del texto o tras un espacio o salto de línea.
 * Solo cuentan las plantillas ACTIVAS: una desactivada conserva su atajo en
 * la API pero aquí nunca se inserta.
 */
export function shortcutBeforeCaret<T extends ShortcutTemplate>(
  text: string,
  caret: number,
  templates: readonly T[],
): ShortcutMatch<T> | null {
  if (caret < 2 || text[caret - 1] !== ' ') return null;
  let start = caret - 1;
  while (start > 0 && !/\s/.test(text[start - 1])) start -= 1;
  const token = text.slice(start, caret - 1);
  if (!token.startsWith('#')) return null;
  const key = shortcutKey(token);
  const template = templates.find((t) => t.active && t.shortcut !== null && shortcutKey(t.shortcut) === key);
  return template ? { template, start, end: caret, token } : null;
}

/** Sustituye `[start, end)` por `insert`; el cursor queda al final de lo insertado. */
export function replaceRange(
  text: string,
  start: number,
  end: number,
  insert: string,
): { text: string; caret: number } {
  return { text: text.slice(0, start) + insert + text.slice(end), caret: start + insert.length };
}

const MARKER = /\{\{([^{}]*)\}\}/g;

/** Los marcadores `{{Etiqueta}}` que siguen sin rellenar, sin repetir y en orden. */
export function unfilledPlaceholders(text: string): string[] {
  const seen = new Set<string>();
  for (const match of text.matchAll(MARKER)) seen.add(match[0]);
  return [...seen];
}

function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

/** «Falta rellenar {{Diente}}.» / «Faltan por rellenar {{Diente}} y {{Cara}}.» */
export function missingPlaceholdersMessage(markers: string[]): string | null {
  if (markers.length === 0) return null;
  return markers.length === 1
    ? `Falta rellenar ${markers[0]}.`
    : `Faltan por rellenar ${listJoin(markers)}.`;
}
