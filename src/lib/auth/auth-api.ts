import { apiFetchOrNull, withSessionLock } from '@/lib/api/client';
import { announceLogout } from './session-channel';

/**
 * Cierra la sesión en el servidor: la API revoca el refresh token de la cookie
 * HttpOnly (denylist por jti) y borra la cookie (DX-062). Va bajo el lock del
 * refresh, para no cruzarse con otra pestaña que esté rotando la cookie, y avisa
 * a las demás pestañas DESPUÉS de revocar (si avisara antes, una de ellas podría
 * renovar con la cookie aún viva). Es best-effort: si la red falla o el backend
 * responde error, NO lanza — el cierre local (olvidar el access token y
 * redirigir) debe ocurrir igual.
 */
export async function logout(): Promise<void> {
  try {
    await withSessionLock(() => apiFetchOrNull('/auth/logout', { method: 'POST' }));
  } catch {
    // best-effort: ignorar cualquier fallo de red/servidor
  } finally {
    announceLogout();
  }
}
