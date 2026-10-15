/**
 * Lee los claims de un JWT SIN verificar la firma. Solo para decisiones de
 * cliente (qué pintar, si un token ya caducó y conviene renovarlo antes de
 * usarlo): el servidor vuelve a validar todo. `null` si no es un JWT legible.
 */
export function readJwtClaims(token: string | null | undefined): Record<string, unknown> | null {
  if (!token) return null;
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const claims: unknown = JSON.parse(atob(padded));
    if (typeof claims !== 'object' || claims === null) return null;
    return claims as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * ¿El token ya caducó (o caduca en menos de `skewMs`)? Un token sin `exp`
 * legible se da por vigente: no hay forma de saberlo, y si no lo está el
 * servidor responderá 401.
 */
export function isJwtExpired(token: string, nowMs = Date.now(), skewMs = 10_000): boolean {
  const exp = readJwtClaims(token)?.exp;
  if (typeof exp !== 'number') return false;
  return exp * 1000 <= nowMs + skewMs;
}
