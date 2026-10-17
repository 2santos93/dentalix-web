import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

export type PlatformMfaStatus = components['schemas']['PlatformMfaStatusDto'];
export type PlatformMfaEnrollment = components['schemas']['PlatformMfaEnrollmentDto'];

/** Una clínica tal como la lista el área de plataforma. */
export interface PlatformTenant {
  id: string;
  name: string;
  subdomain: string;
  createdAt: string;
}

/**
 * Login de PLATAFORMA: es el mismo `POST /auth/login` de siempre, pero hecho
 * desde el apex. El cliente manda `X-Tenant-Host` con el host actual y, al no
 * haber subdominio de clínica, el backend no resuelve ningún tenant y responde
 * con un token de plataforma (solo si el usuario es superadmin; en cualquier
 * otro caso, 401 con el mismo mensaje que unas credenciales malas). El refresh
 * queda en la cookie HttpOnly del apex (DX-062).
 */
export async function loginPlatform(
  email: string,
  password: string,
): Promise<{ accessToken: string }> {
  return apiFetch<{ accessToken: string }>(
    '/auth/login',
    { method: 'POST', body: { email, password } },
  );
}

/** `GET /platform/tenants` — todas las clínicas, ordenadas por nombre. */
export async function listPlatformTenants(
  token: string,
): Promise<PlatformTenant[]> {
  return apiFetch<PlatformTenant[]>('/platform/tenants', { token });
}

/**
 * URL de una clínica a partir de su subdominio, respetando el host actual
 * (protocolo y puerto incluidos) para que funcione igual en local
 * (`clinica.localhost:3001`) que en producción.
 */
export function clinicUrl(subdomain: string): string {
  if (typeof window === 'undefined') return `https://${subdomain}`;
  const { protocol, host } = window.location;
  return `${protocol}//${subdomain}.${host}`;
}

/** `GET /platform/mfa` — si el superadmin ya tiene la verificación en dos pasos (SEC-008). */
export async function getPlatformMfa(token: string): Promise<PlatformMfaStatus> {
  return apiFetch<PlatformMfaStatus>('/platform/mfa', { token });
}

/**
 * `POST /platform/mfa/enrollment` — genera un secreto nuevo (pendiente hasta
 * confirmarlo). El secreto solo viaja en esta respuesta: no se guarda en el
 * navegador.
 */
export async function startPlatformMfaEnrollment(token: string): Promise<PlatformMfaEnrollment> {
  return apiFetch<PlatformMfaEnrollment>('/platform/mfa/enrollment', { method: 'POST', token });
}

/** `POST /platform/mfa/enrollment/confirm` — activa el MFA con un código de la app. */
export async function confirmPlatformMfa(token: string, code: string): Promise<PlatformMfaStatus> {
  return apiFetch<PlatformMfaStatus>('/platform/mfa/enrollment/confirm', {
    method: 'POST',
    token,
    body: { code },
  });
}

/** El secreto en grupos de 4 para teclearlo sin perderse («ABCD EFGH …»). */
export function groupSecret(secret: string): string {
  return secret.replace(/(.{4})/g, '$1 ').trim();
}
