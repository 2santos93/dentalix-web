import { apiFetch } from '@/lib/api/client';

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
 * otro caso, 401 con el mismo mensaje que unas credenciales malas).
 */
export async function loginPlatform(
  email: string,
  password: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  return apiFetch<{ accessToken: string; refreshToken: string }>(
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
