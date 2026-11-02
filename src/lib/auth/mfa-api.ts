import { apiFetch, apiFetchOrNull } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';
import { useAuthStore } from './auth-store';

export type MyMfaStatus = components['schemas']['MyMfaStatusDto'];
export type MfaEnrollment = components['schemas']['MfaEnrollmentDto'];
export type MyMfaEnabled = components['schemas']['MyMfaEnabledDto'];
export type MfaEnrolledSession = components['schemas']['MfaEnrolledSessionDto'];
export type SecurityPolicy = components['schemas']['SecurityPolicyDto'];
export type TrustedDevice = components['schemas']['TrustedDeviceDto'];
export type StaffMfaStatus = components['schemas']['StaffMfaStatusDto'];
export type MfaResetReason = components['schemas']['ResetMemberMfaDto']['reason'];

/** DX-021: lo que devuelve el login cuando falta el segundo factor. */
export type MfaChallenge = components['schemas']['MfaChallengeDto'];
export const MFA_REQUIRED = 'MFA_REQUIRED';
export const MFA_ENROLLMENT_REQUIRED = 'MFA_ENROLLMENT_REQUIRED';
/** Token intermedio caducado o ya usado: hay que volver a la contraseña. */
export const MFA_CHALLENGE_EXPIRED = 'MFA_CHALLENGE_EXPIRED';

/** El segundo factor: el código de la app o uno de recuperación. */
export type SecondFactor = { code: string } | { recoveryCode: string };

/**
 * Código de recuperación tal como se teclea → `XXXX-XXXX-XXXX-XXXX`, o `null`
 * si no son 16 caracteres base32. La API lo vuelve a normalizar.
 */
export function normalizeRecoveryCode(raw: string): string | null {
  const clean = raw.replace(/[\s-]/g, '').toUpperCase();
  if (!/^[A-Z2-7]{16}$/.test(clean)) return null;
  return clean.replace(/(.{4})(?=.)/g, '$1-');
}

/** Solo ADMIN ve y cambia la política de seguridad de la clínica. */
export function canManageSecurityPolicy(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

// --- Segundo paso del login (sin sesión: se autentica con `mfaToken`) ---

export function verifyLoginMfa(
  mfaToken: string,
  factor: SecondFactor,
  rememberDevice = false,
): Promise<{ accessToken: string }> {
  return apiFetch('/auth/login/mfa', {
    method: 'POST',
    body: { mfaToken, ...factor, ...(rememberDevice ? { rememberDevice } : {}) },
  });
}

/** `emailCode`: el alta de un superadmin exige el código enviado a su correo. */
export function startLoginMfaEnrollment(
  mfaToken: string,
  emailCode?: string,
): Promise<MfaEnrollment> {
  return apiFetch('/auth/login/mfa/enrollment', {
    method: 'POST',
    body: { mfaToken, ...(emailCode ? { emailCode } : {}) },
  });
}

export function confirmLoginMfaEnrollment(
  mfaToken: string,
  code: string,
): Promise<MfaEnrolledSession> {
  return apiFetch('/auth/login/mfa/enrollment/confirm', {
    method: 'POST',
    body: { mfaToken, code },
  });
}

// --- Mi perfil ---

export function getMyMfa(token: string): Promise<MyMfaStatus> {
  return apiFetch('/me/mfa', { token });
}

export function startMyMfaEnrollment(
  token: string,
  currentPassword: string,
): Promise<MfaEnrollment> {
  return apiFetch('/me/mfa/enrollment', {
    method: 'POST',
    token,
    body: { currentPassword },
  });
}

/**
 * Activa la verificación. Cierra las demás sesiones: la API devuelve el access
 * nuevo de ESTE dispositivo, que sustituye al anterior (el refresh, en la cookie).
 */
export async function confirmMyMfaEnrollment(token: string, code: string): Promise<MyMfaEnabled> {
  const res = await apiFetch<MyMfaEnabled>('/me/mfa/enrollment/confirm', {
    method: 'POST',
    token,
    body: { code },
  });
  useAuthStore.getState().setAccessToken(res.accessToken);
  return res;
}

export async function disableMyMfa(
  token: string,
  currentPassword: string,
  factor: SecondFactor,
): Promise<void> {
  const res = await apiFetch<{ accessToken: string }>('/me/mfa/disable', {
    method: 'POST',
    token,
    body: { currentPassword, ...factor },
  });
  useAuthStore.getState().setAccessToken(res.accessToken);
}

export async function regenerateRecoveryCodes(
  token: string,
  currentPassword: string,
  factor: SecondFactor,
): Promise<string[]> {
  const res = await apiFetch<{ recoveryCodes: string[] }>('/me/mfa/recovery-codes', {
    method: 'POST',
    token,
    body: { currentPassword, ...factor },
  });
  return res.recoveryCodes;
}

// --- Dispositivos de confianza (DX-021-bis) ---

export function listTrustedDevices(token: string): Promise<TrustedDevice[]> {
  return apiFetch('/me/mfa/trusted-devices', { token });
}

/** Sin `id`, todos. */
export async function revokeTrustedDevices(token: string, id?: string): Promise<void> {
  await apiFetchOrNull<null>(`/me/mfa/trusted-devices${id ? `/${id}` : ''}`, {
    method: 'DELETE',
    token,
  });
}

// --- La verificación de otro miembro (solo ADMIN, DX-021-bis) ---

export function getStaffMfa(token: string, userId: string): Promise<StaffMfaStatus> {
  return apiFetch(`/staff/${userId}/mfa`, { token });
}

export async function resetStaffMfa(
  token: string,
  userId: string,
  input: { currentPassword: string; reason: MfaResetReason; factor: SecondFactor },
): Promise<void> {
  const { factor, ...rest } = input;
  await apiFetchOrNull<null>(`/staff/${userId}/mfa/reset`, {
    method: 'POST',
    token,
    body: { ...rest, ...factor },
  });
}

// --- Política de la clínica ---

export function getSecurityPolicy(token: string): Promise<SecurityPolicy> {
  return apiFetch('/security-policy', { token });
}

export function updateSecurityPolicy(token: string, body: SecurityPolicy): Promise<SecurityPolicy> {
  return apiFetch('/security-policy', { method: 'PUT', token, body });
}
