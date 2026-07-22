const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

// `primaryColor` is tenant-admin-settable data crossing a trust boundary and
// gets spliced raw into a `<style>` tag in layout.tsx. Validate it here, at
// the boundary, so anything that isn't a strict hex color is dropped instead
// of enabling CSS injection (e.g. `red};body{display:none`).
const HEX = /^#[0-9a-fA-F]{3,8}$/;

export interface Branding {
  primaryColor: string | null;
  name: string | null;
}

export async function fetchBranding(tenant: string | null): Promise<Branding> {
  if (!tenant) return { primaryColor: null, name: null };
  try {
    const res = await fetch(`${API}/public/tenant/branding`, {
      headers: { 'X-Tenant': tenant },
      cache: 'no-store',
    });
    if (!res.ok) return { primaryColor: null, name: null };
    const data = (await res.json()) as Partial<Branding>;
    const primaryColor =
      typeof data.primaryColor === 'string' && HEX.test(data.primaryColor)
        ? data.primaryColor
        : null;
    return { primaryColor, name: data.name ?? null };
  } catch {
    return { primaryColor: null, name: null };
  }
}
