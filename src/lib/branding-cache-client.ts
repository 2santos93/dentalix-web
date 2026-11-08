/**
 * DX-517-ter: tras guardar la marca o los textos de moneda, pide a la web
 * (mismo origen, `POST /api/branding-cache`) que olvide la marca guardada de
 * ESTE host, para que la siguiente página (el login, una recarga) ya salga
 * con la nueva. No manda ningún host ni dato. Nunca lanza: si falla, la caché
 * del servidor caduca sola en 30 s.
 */
export async function forgetServerBranding(): Promise<void> {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return;
  try {
    await fetch('/api/branding-cache', { method: 'POST', credentials: 'same-origin', cache: 'no-store' });
  } catch {
    // Sin red o sin la ruta: la marca del servidor se pone al día en 30 s.
  }
}
