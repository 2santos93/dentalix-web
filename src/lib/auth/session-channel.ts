/**
 * Aviso entre pestañas del mismo host (DX-062): al cerrar sesión en una, las
 * demás olvidan su access token en memoria en vez de seguir usándolo hasta que
 * caduque. El refresh ya lo comparten por la cookie, que el logout borra.
 */
export const SESSION_CHANNEL = 'dentalix-session';

type SessionMessage = 'logout';

function channel(): BroadcastChannel | null {
  return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(SESSION_CHANNEL);
}

export function announceLogout(): void {
  const ch = channel();
  if (!ch) return;
  ch.postMessage('logout' satisfies SessionMessage);
  ch.close();
}

/** Escucha los cierres de sesión de otras pestañas; devuelve cómo dejar de escuchar. */
export function onLogoutElsewhere(handler: () => void): () => void {
  const ch = channel();
  if (!ch) return () => {};
  ch.onmessage = (event: MessageEvent<SessionMessage>) => {
    if (event.data === 'logout') handler();
  };
  return () => ch.close();
}
