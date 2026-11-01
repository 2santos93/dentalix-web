import { apiUrl } from '@/lib/api/api-base';
import { readCurrencyTexts, type CurrencyTexts } from '@/lib/format/currency-text';

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
  /**
   * DX-517: texto propio de cada moneda (código ISO → texto); vacío = el
   * código. `null` = no se supo (sin clínica en el host o la marca falló): el
   * navegador lo pide (`CurrencyTextsSync`).
   */
  currencyTexts: CurrencyTexts | null;
}

const EMPTY: Branding = { primaryColor: null, name: null, logoUrl: null, currencyTexts: null };

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
    const res = await fetch(`${apiUrl()}/public/tenant/branding`, {
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
      // Dato de la clínica que cruza una frontera: solo códigos ISO con un texto válido.
      currencyTexts: readCurrencyTexts(data.currencyTexts),
    };
  } catch {
    return EMPTY;
  }
}
