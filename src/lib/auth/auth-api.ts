import { apiFetch } from '@/lib/api/client';

/**
 * Cierra la sesión en el servidor revocando el refresh token (denylist por
 * jti). Es best-effort: si la red falla o el backend responde error, NO lanza
 * — el cierre local (borrar tokens + redirigir) debe ocurrir igual. El path se
 * usa como string, igual que `/auth/refresh` (no está en el schema generado).
 */
export async function logout(refreshToken: string): Promise<void> {
  try {
    await apiFetch('/auth/logout', {
      method: 'POST',
      body: { refreshToken },
    });
  } catch {
    // best-effort: ignorar cualquier fallo de red/servidor
  }
}
