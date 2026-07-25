const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

/**
 * `GET /public/tenant/branding` — resolves the tenant the same way the rest
 * of the app does via `apiFetch` (`client.ts`): the browser's
 * `window.location.host` sent as `X-Tenant-Host` (the backend's
 * `select-host.ts` tries `x-tenant-host` first). `branding.ts`'s existing
 * `fetchBranding` sends the wrong header (`X-Tenant`, a tenant slug it
 * expects the caller to already know) and can't resolve the tenant from the
 * browser this way — rather than touching that (shared, unrelated call
 * sites), this is a small standalone fetch used only to get the clinic's
 * display name for the payment receipt (RECIBO-T1). No auth token needed —
 * the route is public. Fails soft to `null` (the receipt already handles a
 * missing `clinicName` with a fallback), same fail-soft shape as
 * `fetchBranding`.
 */
export async function fetchClinicName(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  try {
    const res = await fetch(`${API}/public/tenant/branding`, {
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
