import type { ClinicRole } from '@/lib/me/me-api';
import { readJwtClaims } from '@/lib/auth/jwt-claims';

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
  const role = readJwtClaims(token)?.role;
  return ROLES.find((r) => r === role) ?? null;
}

/**
 * El usuario de la sesión (`sub` del access token). Mismo alcance que
 * `getTokenRole`: solo decide qué se PINTA (p. ej. «Anular» en las recetas que
 * emitió uno mismo); el servidor vuelve a comprobarlo.
 */
export function getTokenUserId(token: string | null | undefined): string | null {
  const sub = readJwtClaims(token)?.sub;
  return typeof sub === 'string' && sub !== '' ? sub : null;
}

/**
 * Sedes que la sesión puede usar (claim `loc` del access token, DX-089).
 *
 * `null` = todas (el claim no viene: ADMIN o miembro sin restricción); `[]` =
 * ninguna. Mismo alcance que `getTokenRole`: solo decide qué se PINTA (qué
 * sedes ofrece el selector); la API vuelve a comprobar cada `X-Location-Id` y
 * filtra `GET /locations`. Se actualiza al renovar el token, que es justo
 * cuando el servidor empieza a aplicar un cambio de sedes.
 */
export function getTokenAllowedLocationIds(token: string | null | undefined): string[] | null {
  const loc = readJwtClaims(token)?.loc;
  if (!Array.isArray(loc)) return null;
  return loc.filter((id): id is string => typeof id === 'string' && id !== '');
}
