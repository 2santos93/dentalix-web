import type { ClinicRole } from '@/lib/me/me-api';

const ROLES: readonly ClinicRole[] = ['DENTIST', 'ASSISTANT', 'RECEPTION', 'ADMIN'];

/**
 * El rol de la sesión en ESTA clínica, leído del access token.
 *
 * El JWT de clínica lleva `tenantId` y `role` (ver `JwtPayload` en la API), y
 * es la única fuente que sabe en qué clínica estás: `GET /me` devuelve todas
 * las membresías del usuario sin decir cuál es la de este host.
 *
 * Solo sirve para decidir qué se PINTA (p. ej. qué entradas del menú ve cada
 * rol). No es una frontera de seguridad: la firma no se verifica aquí y no
 * hace falta, porque cada endpoint vuelve a comprobar el rol en el servidor —
 * un token manipulado enseñaría un enlace que acaba en 403.
 *
 * Devuelve `null` ante cualquier cosa que no sea un token de clínica legible
 * (sin sesión, token de plataforma, basura): quien lo use debe tratar `null`
 * como "sin permiso", nunca como "todos".
 */
export function getTokenRole(token: string | null | undefined): ClinicRole | null {
  if (!token) return null;
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const claims: unknown = JSON.parse(atob(padded));
    if (typeof claims !== 'object' || claims === null) return null;
    const role = (claims as { role?: unknown }).role;
    return ROLES.find((r) => r === role) ?? null;
  } catch {
    return null;
  }
}
