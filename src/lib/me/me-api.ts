import { apiFetch, apiFetchOrNull } from '@/lib/api/client';

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

export async function changePassword(
  token: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  // 204 sin body → apiFetchOrNull tolera el body vacío.
  await apiFetchOrNull('/me/password', {
    method: 'POST',
    token,
    body: { currentPassword, newPassword },
  });
}

export function uploadAvatar(token: string, file: File): Promise<{ avatarUrl: string }> {
  const fd = new FormData();
  fd.append('file', file);
  return apiFetch<{ avatarUrl: string }>('/me/avatar', { method: 'POST', token, body: fd });
}

export async function removeAvatar(token: string): Promise<void> {
  await apiFetchOrNull('/me/avatar', { method: 'DELETE', token });
}
