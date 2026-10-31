import { parseTenantFromHost } from '@/lib/tenant';

/**
 * La dirección de Dentalix de la clínica (su subdominio, p. ej.
 * `sonrisa.dentalix.app`), leída del host desde el que se abrió la app.
 * `null` si se entró por un dominio propio o por un host sin clínica: desde
 * ahí no se sabe cuál es el subdominio y es mejor no mostrar uno inventado.
 * En local (`demo.localhost:3001`) conserva el puerto, para que copiarla sirva.
 */
export function clinicAddress(host: string | null | undefined): string | null {
  if (!host) return null;
  const hostname = host.split(':')[0].toLowerCase();
  if (hostname.endsWith('.localhost')) return host.toLowerCase();
  return parseTenantFromHost(host) ? hostname : null;
}
