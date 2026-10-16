/**
 * Content-Security-Policy de las páginas de la web (DX-062, FE-002). La genera
 * `proxy.ts` en cada petición con un nonce nuevo; Next lo lee de la cabecera de
 * la petición y lo pone en sus propios scripts.
 *
 * - `script-src`: solo scripts con el nonce y lo que ellos carguen
 *   (`'strict-dynamic'`). `'unsafe-eval'` SOLO en desarrollo (React reconstruye
 *   las trazas del servidor con eval); en producción no hace falta.
 * - `style-src 'unsafe-inline'`: React/Radix usan atributos `style` y el layout
 *   inyecta el color de la clínica; un nonce no cubre atributos `style`. Los
 *   estilos no ejecutan código; la barrera contra XSS es `script-src`.
 * - `connect-src 'self'`: el navegador llega a la API por `/api/v1` del mismo
 *   host (ver `api-base.ts`).
 * - `img-src`: logos y avatares los sirve la API (otro origen), `data:` para la
 *   firma de consentimientos y `blob:` para la vista previa de imágenes.
 */
export interface CspOptions {
  nonce: string;
  isDev: boolean;
  apiOrigin: string;
}

export function buildCsp({ nonce, isDev, apiOrigin }: CspOptions): string {
  const directives: [string, string[]][] = [
    ['default-src', ["'self'"]],
    ['script-src', ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : [])]],
    ['style-src', ["'self'", "'unsafe-inline'"]],
    ['img-src', ["'self'", 'data:', 'blob:', apiOrigin]],
    ['font-src', ["'self'"]],
    ['connect-src', ["'self'"]],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    ['frame-ancestors', ["'none'"]],
  ];
  return directives.map(([name, values]) => `${name} ${values.join(' ')}`).join('; ');
}

/** Nonce de 128 bits en base64, distinto en cada petición. */
export function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}
