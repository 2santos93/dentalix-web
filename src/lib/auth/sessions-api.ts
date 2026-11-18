import { apiFetch, apiFetchOrNull } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

/** DX-137: una sesión abierta (navegador y sistema resumidos, IP truncada). */
export type UserSession = components['schemas']['UserSessionDto'];
export type NotMeResult = components['schemas']['NotMeResultDto'];

// --- Las propias («Mi perfil › Sesiones») ---

export function listMySessions(token: string): Promise<UserSession[]> {
  return apiFetch('/me/sessions', { token });
}

export async function revokeMySession(token: string, sessionId: string): Promise<void> {
  await apiFetchOrNull<null>(`/me/sessions/${sessionId}`, {
    method: 'DELETE',
    token,
  });
}

export async function revokeMyOtherSessions(token: string): Promise<number> {
  const res = await apiFetch<{ sessionsClosed: number }>('/me/sessions/revoke-others', {
    method: 'POST',
    token,
  });
  return res.sessionsClosed;
}

// --- Las de un miembro (solo ADMIN) ---

export function listStaffSessions(token: string, userId: string): Promise<UserSession[]> {
  return apiFetch(`/staff/${userId}/sessions`, { token });
}

export async function revokeStaffSession(token: string, userId: string, sessionId: string): Promise<void> {
  await apiFetchOrNull<null>(`/staff/${userId}/sessions/${sessionId}`, {
    method: 'DELETE',
    token,
  });
}

export async function revokeAllStaffSessions(token: string, userId: string): Promise<number> {
  const res = await apiFetch<{ sessionsClosed: number }>(`/staff/${userId}/sessions/revoke-all`, {
    method: 'POST',
    token,
  });
  return res.sessionsClosed;
}

// --- «No fui yo» (público, enlace del email) ---

export function notMe(token: string): Promise<NotMeResult> {
  return apiFetch('/auth/session-alerts/not-me', {
    method: 'POST',
    body: { token },
  });
}
