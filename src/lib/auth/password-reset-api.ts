import { apiFetch, apiFetchOrNull } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

export type ForgotPasswordResponse = components['schemas']['ForgotPasswordResponseDto'];
export type PasswordResetTokenStatus = components['schemas']['PasswordResetTokenStatus'];

/** Ruta pública con el formulario «¿Olvidaste tu contraseña?». */
export const FORGOT_PASSWORD_PATH = '/olvide-contrasena';
/** Aviso del login tras restablecer (`/login?restablecida=1`). */
export const PASSWORD_RESET_DONE_PARAM = 'restablecida';

/**
 * `POST /auth/forgot-password` (DX-010): la API responde SIEMPRE 202 con el
 * mismo texto, exista o no la cuenta (sin enumeración de usuarios). La
 * clínica sale del host de la página.
 */
export function requestPasswordReset(email: string): Promise<ForgotPasswordResponse> {
  return apiFetch<ForgotPasswordResponse>('/auth/forgot-password', {
    method: 'POST',
    body: { email },
  });
}

/** `POST /auth/reset-password/check`: estado del enlace antes de pedir la contraseña. */
export async function checkPasswordResetToken(token: string): Promise<PasswordResetTokenStatus> {
  const res = await apiFetch<components['schemas']['PasswordResetTokenStatusDto']>(
    '/auth/reset-password/check',
    { method: 'POST', body: { token } },
  );
  return res.status;
}

/**
 * `POST /auth/reset-password` → 204. Cierra todas las sesiones del usuario; no
 * abre una nueva (la pantalla lleva al login).
 */
export async function resetPassword(token: string, password: string): Promise<void> {
  await apiFetchOrNull<null>('/auth/reset-password', {
    method: 'POST',
    body: { token, password },
  });
}
