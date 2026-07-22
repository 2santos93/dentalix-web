const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'dentalix.local';

/**
 * Devuelve el slug de tenant a partir del host (subdominio), o null si el host
 * es el dominio raíz, www, o localhost (sin tenant).
 */
export function parseTenantFromHost(host: string | null): string | null {
  if (!host) return null;
  const hostname = host.split(':')[0].toLowerCase();
  if (hostname === 'localhost' || hostname === '127.0.0.1') return null;
  if (hostname === ROOT_DOMAIN || hostname === `www.${ROOT_DOMAIN}`) return null;
  if (hostname.endsWith(`.${ROOT_DOMAIN}`)) {
    const sub = hostname.slice(0, -1 * (ROOT_DOMAIN.length + 1));
    return sub === 'www' || sub === '' ? null : sub;
  }
  return null;
}
