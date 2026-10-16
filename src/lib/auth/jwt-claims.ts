/**
 * Lee los claims de un JWT SIN verificar la firma. Solo para decisiones de
 * cliente (qué pintar según el rol): el servidor vuelve a validar todo.
 * `null` si no es un JWT legible.
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
