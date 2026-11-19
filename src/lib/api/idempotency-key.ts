/**
 * Un UUID v4 para la cabecera `Idempotency-Key` (DX-574): la API devuelve el
 * mismo registro si llega dos veces el mismo envío con la misma clave.
 * `crypto.randomUUID` solo existe en contextos seguros; fuera de ellos (un
 * host de pruebas sin HTTPS) se arma con `getRandomValues` y, en último
 * término, con `Math.random`.
 */
export function newIdempotencyKey(): string {
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Cabecera opcional: sin clave, nada. */
export function idempotencyHeaders(key: string | null | undefined): { headers?: Record<string, string> } {
  return key ? { headers: { 'Idempotency-Key': key } } : {};
}

/** Código del 422 cuando la misma clave llega con otro cuerpo. */
export const IDEMPOTENCY_KEY_REUSED = 'IDEMPOTENCY_KEY_REUSED';
