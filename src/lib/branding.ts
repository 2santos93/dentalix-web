const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

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
    return { primaryColor: data.primaryColor ?? null, name: data.name ?? null };
  } catch {
    return { primaryColor: null, name: null };
  }
}
