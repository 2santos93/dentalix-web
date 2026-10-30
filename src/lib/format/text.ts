/** Texto libre recortado y con los espacios repetidos juntos, como lo guarda la API. */
export function collapseSpaces(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/**
 * Cierra una frase con punto, salvo que ya acabe en uno: una hora en 12 h
 * («10:30 a. m.») no lleva un segundo punto (DX-378).
 */
export function endSentence(text: string): string {
  return text.endsWith('.') ? text : `${text}.`;
}
