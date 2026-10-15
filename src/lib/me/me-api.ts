import { apiFetch, apiFetchOrNull } from '@/lib/api/client';
import { useAuthStore } from '@/lib/auth/auth-store';

// Espejo del enum Prisma `ClinicRole` (no se expone como componente propio en
// el OpenAPI). Mantener en sync — mismo criterio que staff-api.ts.
export type ClinicRole = 'DENTIST' | 'ASSISTANT' | 'RECEPTION' | 'ADMIN';

export interface MyProfileMembership {
  tenantId: string;
  clinicName: string;
  role: ClinicRole;
}

export interface MyProfile {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  emailVerifiedAt: string | null;
  memberships: MyProfileMembership[];
}

export function getMe(token: string): Promise<MyProfile> {
  return apiFetch<MyProfile>('/me', { token });
}

export function updateName(token: string, fullName: string): Promise<MyProfile> {
  return apiFetch<MyProfile>('/me', { method: 'PATCH', token, body: { fullName } });
}

/**
 * Cambiar la contraseña cierra en el backend TODAS las sesiones previas del
 * usuario (los refresh tokens anteriores, incluido el de esta pestaña, dejan
 * de renovar) y devuelve un par nuevo para este cliente, que se guarda aquí
 * para no expulsar a quien acaba de cambiarla. `apiFetchOrNull` tolera además
 * un 204 sin body (backend anterior): entonces se conserva la sesión actual.
 */
export async function changePassword(
  token: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const fresh = await apiFetchOrNull<{ accessToken: string; refreshToken: string }>(
    '/me/password',
    {
      method: 'POST',
      token,
      body: { currentPassword, newPassword },
    },
  );
  if (fresh) useAuthStore.getState().setTokens(fresh);
}

export function uploadAvatar(token: string, file: File): Promise<{ avatarUrl: string }> {
  const fd = new FormData();
  fd.append('file', file);
  return apiFetch<{ avatarUrl: string }>('/me/avatar', { method: 'POST', token, body: fd });
}

export async function removeAvatar(token: string): Promise<void> {
  await apiFetchOrNull('/me/avatar', { method: 'DELETE', token });
}
