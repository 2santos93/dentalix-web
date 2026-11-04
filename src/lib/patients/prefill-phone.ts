/**
 * DX-224: el teléfono que «¿Quién llama?» le pasa al alta de paciente
 * («Crear paciente» sin coincidencias). Va en memoria del navegador y no en la
 * URL: un teléfono en una dirección queda en el historial, el proxy y los
 * registros. Se lee sin consumir (React puede montar dos veces) y lo limpia
 * quien lo usó al desmontarse.
 */
let pending: string | null = null;

export function setPrefillPhone(phone: string): void {
  pending = phone.trim() || null;
}

export function peekPrefillPhone(): string {
  return pending ?? '';
}

export function clearPrefillPhone(): void {
  pending = null;
}
