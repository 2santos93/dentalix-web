/**
 * DX-458 (OPS-054): sonda de salud de la web para el balanceador y el
 * orquestador (liveness y readiness). Ligera a propósito:
 *
 * - No llama a la API ni lee nada: si la API cae, la web sigue «sana» (sabe
 *   servir su página de error); la salud de la API tiene su propia sonda.
 * - No dice nada del despliegue: sin versión, tenant, host ni datos. El
 *   cuerpo es siempre `{"status":"ok"}` o `{"status":"draining"}`.
 * - No pasa por `src/proxy.ts` (el matcher excluye `/api/` salvo `/api/v1/*`):
 *   ni tenant por host, ni reescritura, ni redirección, ni nonce de CSP.
 * - 503 en cuanto el proceso recibe SIGTERM (`scripts/docker/server-entry.cjs`
 *   marca `Symbol.for('dentalix.web.shuttingDown')` en `globalThis`, el mismo
 *   proceso): el balanceador deja de mandarle peticiones mientras drena.
 */
import { isShuttingDown } from '@/lib/shutdown-state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEADERS = { 'cache-control': 'no-store', 'content-type': 'application/json' } as const;

export function GET(): Response {
  if (isShuttingDown()) return new Response('{"status":"draining"}', { status: 503, headers: HEADERS });
  return new Response('{"status":"ok"}', { status: 200, headers: HEADERS });
}

export function HEAD(): Response {
  return new Response(null, { status: isShuttingDown() ? 503 : 200, headers: HEADERS });
}
