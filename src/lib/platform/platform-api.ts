import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { MfaChallenge, SecondFactor } from '@/lib/auth/mfa-api';

export type PlatformMfaStatus = components['schemas']['PlatformMfaStatusDto'];

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
 * con el paso del segundo factor (solo si el usuario es superadmin; en cualquier
 * otro caso, 401 con el mismo mensaje que unas credenciales malas). DX-021-bis:
 * el token de plataforma sale tras ese paso, y el refresh queda en la cookie
 * HttpOnly del apex (DX-062).
 */
export async function loginPlatform(email: string, password: string): Promise<MfaChallenge> {
  return apiFetch<MfaChallenge>(
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

/** `POST /platform/mfa/recovery-codes` — los anteriores dejan de valer. */
export async function regeneratePlatformRecoveryCodes(
  token: string,
  currentPassword: string,
  factor: SecondFactor,
): Promise<string[]> {
  const res = await apiFetch<{ recoveryCodes: string[] }>('/platform/mfa/recovery-codes', {
    method: 'POST',
    token,
    body: { currentPassword, ...factor },
  });
  return res.recoveryCodes;
}

/** El secreto en grupos de 4 para teclearlo sin perderse («ABCD EFGH …»). */
export function groupSecret(secret: string): string {
  return secret.replace(/(.{4})/g, '$1 ').trim();
}
