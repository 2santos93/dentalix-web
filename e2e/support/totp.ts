import { createHmac } from 'node:crypto';

/**
 * TOTP (RFC 6238, SHA-1, 30 s, 6 dígitos) para el e2e del MFA de plataforma
 * (SEC-008): el test hace de «app de autenticación» con el secreto que la web
 * enseña al enrolar. `offsetSteps` = pasos de 30 s respecto de ahora (la API
 * acepta ±1 y no deja reutilizar un paso ya usado).
 */
export function totpNow(secretBase32: string, offsetSteps = 0): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of secretBase32.replace(/\s/g, '').toUpperCase()) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + offsetSteps));
  const hmac = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}
