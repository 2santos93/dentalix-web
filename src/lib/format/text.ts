/** Texto libre recortado y con los espacios repetidos juntos, como lo guarda la API. */
export function collapseSpaces(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}
