/**
 * Cabeceras de seguridad que la web envía en TODAS las rutas (DX-061, FE-002).
 * Se aplican desde `headers()` de `next.config.ts`, que las sirve antes del
 * filesystem (páginas, `/print/...`, `/confirmar/...` y `/public`).
 *
 * - Anti-enmarcado doble: `frame-ancestors 'none'` (lo que miran los navegadores
 *   modernos) y `X-Frame-Options: DENY` (navegadores viejos). Ninguna vista se
 *   embebe en un iframe: la imprimible abre en pestaña nueva y el enlace público
 *   de confirmación se abre directo.
 * - La CSP es SOLO `frame-ancestors`: no restringe scripts, estilos ni
 *   `connect-src`, así que no puede romper la app. La CSP completa con nonce
 *   (en `proxy.ts`) es una tarea aparte.
 */
export const SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

/** Reglas para `headers()` de next.config: las cabeceras en todas las rutas. */
export function securityHeaderRules(): { source: string; headers: typeof SECURITY_HEADERS }[] {
  return [{ source: '/:path*', headers: SECURITY_HEADERS }];
}
