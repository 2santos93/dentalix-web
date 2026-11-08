import { API_PROXY_PATH } from '@/lib/api/api-base';

/**
 * `GET /public/tenant/branding` desde el NAVEGADOR, por el proxy del mismo
 * origen (la API resuelve la clínica por el host de la página, como el resto
 * de `apiFetch`). Solo para el nombre de la clínica en el recibo (RECIBO-T1).
 * La marca del render de servidor es otra cosa: `brandingForRequest` en
 * `branding.ts` (DX-517-ter, por `?host=`). Sin token (la ruta es pública).
 * Si falla, `null` (el recibo ya tiene un respaldo sin `clinicName`).
 */
export async function fetchClinicName(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  try {
    // Mismo origen que el resto del navegador (`/api/v1`, ver `api-base.ts`).
    const res = await fetch(`${API_PROXY_PATH}/public/tenant/branding`, {
      headers: { 'X-Tenant-Host': window.location.host },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { name?: string | null };
    return typeof data.name === 'string' ? data.name : null;
  } catch {
    return null;
  }
}
