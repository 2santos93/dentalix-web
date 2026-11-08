import { cache } from 'react';
import { apiUrl } from '@/lib/api/api-base';
import { readCurrencyTexts, type CurrencyTexts } from '@/lib/format/currency-text';
import { isPlatformHost } from '@/lib/tenant';

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
   * código. `null` = no se supo (sin clínica en el host o la marca falló).
   */
  currencyTexts: CurrencyTexts | null;
}

/**
 * DX-517-ter: qué supo el servidor de la clínica del host.
 * - `clinic`: la marca viene en el primer HTML; el navegador no la pide.
 * - `none`: el host no tiene clínica (plataforma, desconocido, inválido); el
 *   navegador tampoco la pide (salvo al salir del registro sin recargar).
 * - `unknown`: la API no contestó a tiempo o falló; la pide el navegador.
 */
export type BrandingStatus = 'clinic' | 'none' | 'unknown';

export interface ServerBranding extends Branding {
  status: BrandingStatus;
}

const EMPTY: Branding = { primaryColor: null, name: null, logoUrl: null, currencyTexts: null };
const NONE: ServerBranding = Object.freeze({ status: 'none', ...EMPTY });
const UNKNOWN: ServerBranding = Object.freeze({ status: 'unknown', ...EMPTY });

export const BRANDING_FETCH_TIMEOUT_MS = 1000;
export const BRANDING_CACHE_MAX_ENTRIES = 2000;
/** Tras cambiar la marca en Ajustes, otros la ven con hasta 30 s de retraso. */
const CLINIC_TTL_MS = 30_000;
const NONE_TTL_MS = 60_000;

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

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Clave de caché y valor de `?host=`: el host en minúsculas, sin puerto ni un
 * punto final (como lo compara la API, `parseHost`), o `null` si no es un
 * nombre DNS válido (mismas reglas que `normalizeBrandingHost` de la API).
 */
export function brandingHostKey(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string' || raw.length > 260) return null;
  const parts = raw.trim().toLowerCase().split(':');
  if (parts.length > 2) return null;
  const [rawName, port] = parts;
  if (port !== undefined && (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535)) return null;
  const name = rawName.endsWith('.') ? rawName.slice(0, -1) : rawName;
  if (!name || name.length > 253) return null;
  return name.split('.').every((label) => LABEL.test(label)) ? name : null;
}

function readBranding(data: Partial<Record<keyof Branding, unknown>>): ServerBranding {
  const currencyTexts = readCurrencyTexts(data.currencyTexts);
  return Object.freeze({
    status: 'clinic' as const,
    primaryColor: typeof data.primaryColor === 'string' && HEX.test(data.primaryColor) ? data.primaryColor : null,
    name: typeof data.name === 'string' && data.name.trim() ? data.name : null,
    logoUrl: safeLogoUrl(data.logoUrl),
    // Dato de la clínica que cruza una frontera: solo códigos ISO con un texto válido.
    currencyTexts: Object.freeze({ ...currencyTexts }),
  });
}

async function lookup(host: string): Promise<ServerBranding> {
  // El host va SOLO al query (URLSearchParams) sobre la base fija API_URL:
  // nada de él llega a la ruta. Sin cabeceras de clínica: la API la elige por
  // el parámetro, no por la petición.
  const url = new URL(`${apiUrl()}/public/tenant/branding/by-host`);
  url.searchParams.set('host', host);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BRANDING_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (res.status === 404) return NONE;
    if (!res.ok) return UNKNOWN;
    return readBranding((await res.json()) as Partial<Record<keyof Branding, unknown>>);
  } catch {
    return UNKNOWN;
  } finally {
    clearTimeout(timer);
  }
}

// Caché del PROCESO, por host normalizado (nunca una «marca actual» única:
// el servidor atiende a todas las clínicas a la vez). Map en orden de
// inserción → LRU acotado. `unknown` no se guarda. Vive en `globalThis` para
// que el layout y la ruta que la invalida (`/api/branding-cache`) compartan la
// misma aunque Next cargue este módulo en más de un bundle del proceso.
interface Inflight {
  promise: Promise<ServerBranding>;
}
interface BrandingStore {
  entries: Map<string, { expires: number; value: ServerBranding }>;
  inflight: Map<string, Inflight>;
}
const STORE_KEY = Symbol.for('dentalix.serverBrandingCache');
function brandingStore(): BrandingStore {
  const global = globalThis as { [STORE_KEY]?: BrandingStore };
  global[STORE_KEY] ??= { entries: new Map(), inflight: new Map() };
  return global[STORE_KEY];
}
const { entries, inflight } = brandingStore();

function remember(key: string, value: ServerBranding): void {
  if (value.status === 'unknown') return;
  entries.delete(key);
  entries.set(key, { expires: Date.now() + (value.status === 'clinic' ? CLINIC_TTL_MS : NONE_TTL_MS), value });
  while (entries.size > BRANDING_CACHE_MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

/**
 * DX-517-ter: la marca pública de la clínica del host de la petición, para el
 * render de servidor (`GET /public/tenant/branding/by-host?host=`). El host es
 * el `Host` que recibió Next, el mismo que su proxy manda a la API como
 * `X-Forwarded-Host` para las llamadas `/api/v1` del navegador: servidor y
 * navegador resuelven la misma clínica.
 */
export async function fetchBrandingForHost(rawHost: string | null | undefined): Promise<ServerBranding> {
  if (!rawHost || isPlatformHost(rawHost)) return NONE;
  const key = brandingHostKey(rawHost);
  if (!key) return NONE;

  const hit = entries.get(key);
  if (hit && hit.expires > Date.now()) {
    entries.delete(key);
    entries.set(key, hit);
    return hit.value;
  }
  if (hit) entries.delete(key);

  const running = inflight.get(key);
  if (running) return running.promise;
  // Si `forgetBrandingForHost` borra esta consulta mientras va en vuelo (se
  // guardó la marca), su respuesta, quizá anterior al guardado, no se guarda.
  const flight: Inflight = { promise: Promise.resolve(NONE) };
  flight.promise = lookup(key).then((value) => {
    if (inflight.get(key) === flight) {
      remember(key, value);
      inflight.delete(key);
    }
    return value;
  });
  inflight.set(key, flight);
  return flight.promise;
}

/**
 * Olvida la marca guardada de UN host (el de la petición que lo pide, ver
 * `/api/branding-cache`): tras guardar la marca o los textos de moneda, la
 * siguiente página de ESTE proceso la vuelve a pedir a la API. Otras réplicas
 * de la web pueden seguir sirviendo la anterior hasta 30 s.
 */
export function forgetBrandingForHost(rawHost: string | null | undefined): void {
  const key = brandingHostKey(rawHost);
  if (!key) return;
  entries.delete(key);
  inflight.delete(key);
}

/** Una sola consulta por petición (layout raíz + páginas de acceso). */
export const brandingForRequest = cache(fetchBrandingForHost);

/** Solo tests. */
export function resetBrandingCacheForTests(): void {
  entries.clear();
  inflight.clear();
}
