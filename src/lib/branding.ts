const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

// `primaryColor` is tenant-admin-settable data crossing a trust boundary and
// gets spliced raw into a `<style>` tag in layout.tsx. Validate it here, at
// the boundary, so anything that isn't a strict hex color is dropped instead
// of enabling CSS injection (e.g. `red};body{display:none`).
const HEX = /^#[0-9a-fA-F]{3,8}$/;

export interface Branding {
  primaryColor: string | null;
  name: string | null;
  /** Logo de la clínica (A4: el shell autenticado lo enseña). Solo http(s). */
  logoUrl: string | null;
}

const EMPTY: Branding = { primaryColor: null, name: null, logoUrl: null };

/** Solo URLs http(s) absolutas: nada de `javascript:` ni `data:` en un `src`. */
function safeLogoUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * `host` (opcional): el host de la petición. La API resuelve la clínica por
 * `X-Tenant-Host` antes que por `X-Tenant` (`select-host.ts`), y es lo único
 * que funciona cuando el subdominio no coincide con el slug o la clínica usa
 * un dominio propio (A4: sin él, el shell no recibía el nombre de la clínica).
 */
export async function fetchBranding(tenant: string | null, host?: string | null): Promise<Branding> {
  if (!tenant) return EMPTY;
  try {
    const res = await fetch(`${API}/public/tenant/branding`, {
      headers: { 'X-Tenant': tenant, ...(host ? { 'X-Tenant-Host': host } : {}) },
      cache: 'no-store',
    });
    if (!res.ok) return EMPTY;
    const data = (await res.json()) as Partial<Branding>;
    const primaryColor =
      typeof data.primaryColor === 'string' && HEX.test(data.primaryColor)
        ? data.primaryColor
        : null;
    return {
      primaryColor,
      name: typeof data.name === 'string' && data.name.trim() ? data.name : null,
      logoUrl: safeLogoUrl(data.logoUrl),
    };
  } catch {
    return EMPTY;
  }
}
