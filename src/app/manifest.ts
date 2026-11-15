import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { brandingForRequest } from '@/lib/branding';
import { buildWebManifest } from '@/lib/pwa/web-manifest';

/**
 * DX-405: `/manifest.webmanifest` de la clínica del host (nombre, color e
 * icono), con la misma marca pública (y su caché de 30 s) que pinta el primer
 * HTML. Lee `headers()`, así que se genera en cada petición (no al compilar).
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const branding = await brandingForRequest((await headers()).get('host'));
  return buildWebManifest(branding);
}
