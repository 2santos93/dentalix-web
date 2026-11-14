import { forgetBrandingForHost } from '@/lib/branding';

/**
 * DX-517-ter: tras guardar la marca (Ajustes › Datos de la clínica) o los
 * textos de moneda, la pestaña llama aquí para que ESTE proceso de la web
 * olvide la marca que tenía guardada de SU host (`fetchBrandingForHost`, 30 s)
 * y la siguiente página la pida a la API ya cambiada.
 *
 * - Solo el host de la propia petición (`Host`): no acepta ningún host por
 *   query, cuerpo ni cabeceras. Lo peor que puede hacer cualquiera es forzar
 *   una consulta más a la API para su propio host: barato, sin límite propio.
 * - Solo del mismo origen: `Origin` igual al host de la petición (como
 *   `assertTrustedOrigin` de la API) y, si el navegador manda
 *   `Sec-Fetch-Site`, `same-origin`. Otra web no puede dispararla.
 * - No devuelve nada (204 o 403, sin cuerpo) y no se cachea.
 * - Otras réplicas de la web pueden seguir sirviendo la marca anterior hasta
 *   30 s (README, «Marca de la clínica en el servidor»).
 */
// Node, como el render: los dos comparten la caché de `globalThis` del proceso.
export const runtime = 'nodejs';

const NO_STORE = { 'cache-control': 'no-store' } as const;

function isSameOrigin(req: Request, host: string): boolean {
  const fetchSite = req.headers.get('sec-fetch-site');
  if (fetchSite !== null && fetchSite !== 'same-origin') return false;
  const origin = req.headers.get('origin');
  if (!origin || origin === 'null') return false;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

export function POST(req: Request): Response {
  const host = req.headers.get('host');
  if (!host || !isSameOrigin(req, host)) return new Response(null, { status: 403, headers: NO_STORE });
  forgetBrandingForHost(host);
  return new Response(null, { status: 204, headers: NO_STORE });
}
