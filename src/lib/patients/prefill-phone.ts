/**
 * DX-224: el teléfono que «¿Quién llama?» le pasa al alta de paciente
 * («Crear paciente» sin coincidencias). Va en memoria del navegador y no en la
 * URL: un teléfono en una dirección queda en el historial, el proxy y los
 * registros. Se lee sin consumir (React puede montar dos veces), lo limpia
 * quien lo usó al desmontarse y caduca a los 60 s: si la navegación nunca
 * llega al alta, no se cuela en un paciente que no tiene nada que ver (M7).
 */
const TTL_MS = 60_000;

let pending: { phone: string; at: number } | null = null;

export function setPrefillPhone(phone: string): void {
  const trimmed = phone.trim();
  pending = trimmed ? { phone: trimmed, at: Date.now() } : null;
}

export function peekPrefillPhone(): string {
  if (!pending) return '';
  if (Date.now() - pending.at > TTL_MS) {
    pending = null;
    return '';
  }
  return pending.phone;
}

export function clearPrefillPhone(): void {
  pending = null;
}
