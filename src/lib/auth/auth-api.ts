import { apiFetchOrNull } from '@/lib/api/client';
import { announceLogout } from './session-channel';

/**
 * Cierra la sesión en el servidor: la API revoca el refresh token de la cookie
 * HttpOnly (denylist por jti) y borra la cookie (DX-062). Avisa antes a las
 * demás pestañas del host. Es best-effort: si la red falla o el backend
 * responde error, NO lanza — el cierre local (olvidar el access token y
 * redirigir) debe ocurrir igual.
 */
export async function logout(): Promise<void> {
  announceLogout();
  try {
    await apiFetchOrNull('/auth/logout', { method: 'POST' });
  } catch {
    // best-effort: ignorar cualquier fallo de red/servidor
  }
}
