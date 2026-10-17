/**
 * Espera del login tras demasiados intentos fallidos (DX-048). La API responde
 * 429 con `Retry-After` (segundos); la pantalla lo cuenta hacia atrás. El
 * mensaje es el mismo exista o no la cuenta: solo depende de la espera.
 */

/** «Demasiados intentos. Vuelve a intentarlo en N min.» (N ≥ 1, hacia arriba). */
export function loginLockedMessage(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `Demasiados intentos. Vuelve a intentarlo en ${minutes} min.`;
}

/** Cuenta atrás visible, `m:ss`. */
export function waitClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = String(safe % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
}
