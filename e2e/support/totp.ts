import { createHmac } from 'node:crypto';

/**
 * TOTP (RFC 6238, SHA-1, 30 s, 6 dígitos) para los e2e del MFA (SEC-008,
 * DX-021): el test hace de «app de autenticación» con el secreto que la web
 * enseña al enrolar. `offsetSteps` = pasos de 30 s respecto de ahora.
 *
 * La API acepta el paso actual ±1 y nunca uno ya usado, con su reloj. Entre
 * que el test calcula el código y la API lo valida puede pasar el límite de
 * 30 s (DX-552), así que solo se admiten desfases que no cambian de resultado
 * con ese cruce:
 *
 *  - 0 y +1: valen al menos 30 s (60 s el +1) aunque la petición llegue ya en
 *    el paso siguiente. Tras un alta (que gasta el paso actual) entra el +1.
 *  - ≤ −2: no valen nunca (el «código malo» de los specs usa −4).
 *
 * −1 caduca justo en el cruce y +2 empieza a valer en él: los dos daban un
 * resultado distinto según el segundo en que corría el test, por eso lanzan.
 */
export const TOTP_PERIOD_MS = 30_000;

export function totpNow(
  secretBase32: string,
  offsetSteps = 0,
  nowMs = Date.now(),
): string {
  if (offsetSteps === -1 || offsetSteps >= 2) {
    throw new Error(
      `totpNow: desfase ${offsetSteps} depende del segundo en que corre el test; usa 0 o +1 (válido) o ≤ −2 (inválido)`,
    );
  }
  return totpCodeForStep(
    secretBase32,
    Math.floor(nowMs / TOTP_PERIOD_MS) + offsetSteps,
  );
}

/** HOTP truncado (RFC 4226) del paso `step`; base de `totpNow`. */
export function totpCodeForStep(secretBase32: string, step: number): string {
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
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(
    6,
    '0',
  );
}
