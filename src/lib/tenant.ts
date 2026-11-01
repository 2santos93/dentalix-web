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

/**
 * El host es de la plataforma (raíz, www o localhost): ahí nunca hay clínica.
 * No es lo mismo que `parseTenantFromHost(...) === null`: un dominio propio
 * también da null y sí tiene clínica (la resuelve la API por el host).
 */
export function isPlatformHost(host: string): boolean {
  const hostname = host.split(':')[0].toLowerCase();
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === ROOT_DOMAIN ||
    hostname === `www.${ROOT_DOMAIN}`
  );
}

/**
 * Enlace al inicio de sesión de la clínica `subdomain` desde la página actual
 * (DX-029: tras confirmar el registro). Si ya estamos en su host, basta la
 * ruta relativa; si no, se arma su origen sobre el dominio raíz (o
 * `*.localhost` en local), con el mismo protocolo y puerto.
 */
export function clinicLoginHref(
  subdomain: string,
  location: Pick<Location, 'protocol' | 'host'>,
): string {
  const [hostname, port] = location.host.split(':');
  if (parseTenantFromHost(location.host) === subdomain || hostname === `${subdomain}.localhost`) {
    return '/login';
  }
  const base =
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.localhost')
      ? 'localhost'
      : ROOT_DOMAIN;
  return `${location.protocol}//${subdomain}.${base}${port ? `:${port}` : ''}/login`;
}
