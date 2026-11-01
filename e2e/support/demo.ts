import { expect, type APIRequestContext } from '@playwright/test';
import { apiLogin, type ApiSession } from './api';
import { API_URL, tenantOrigin } from './urls';
import { DOC_TYPE_LABEL } from '../../src/lib/patients/doc-type';
import { type RegionalSettings } from './regional';

/**
 * La clínica DEMO (`npm run seed:demo` en la API) es estado compartido: la
 * usan varios specs en la misma base y cada uno lee lo que dejan los demás
 * (DX-337). Lo que un spec cree en ella lo retira al terminar; lo que la demo
 * trae de serie está aquí, y `e2e/support/global-teardown.ts` pone la suite
 * en rojo si al final hay más sedes activas o más personal del sembrado.
 */
export const DEMO_SUBDOMAIN = process.env.E2E_DEMO_SUBDOMAIN ?? 'demo';
export const DEMO_PASSWORD = process.env.E2E_DEMO_PASSWORD ?? 'DemoDentalix2026!';
export const DEMO_ADMIN_EMAIL = process.env.E2E_DEMO_ADMIN_EMAIL ?? 'admin@demo.dentalix.app';

/**
 * Región de cada una de las cuatro sedes que siembra `seed:demo` (V1,
 * DX-335): las dos venezolanas trabajan en USD, en hora de Caracas (UTC−4
 * fijo) y con el formato es-VE; São Paulo en BRL y pt-BR; Londres en GBP y
 * en-GB. Parte de los abonos y de la caja abierta de la principal van en
 * bolívares. Los valores son los de `prisma/demo/data.ts` de la API.
 */
const VE_USD: RegionalSettings = {
  country: 'VE',
  currency: 'USD',
  timeZone: 'America/Caracas',
  locale: 'es-VE',
  hourCycle: 'h23',
};
export const DEMO_LOCATION_REGIONS: Readonly<Record<string, RegionalSettings>> = {
  'Sede principal': VE_USD,
  'Sede Norte': VE_USD,
  'Sede São Paulo': {
    country: 'BR',
    currency: 'BRL',
    timeZone: 'America/Sao_Paulo',
    locale: 'pt-BR',
    hourCycle: 'h23',
  },
  'Sede Londres': {
    country: 'GB',
    currency: 'GBP',
    timeZone: 'Europe/London',
    locale: 'en-GB',
    hourCycle: 'h23',
  },
};
/** La región de la sede principal, la que usan los specs que escriben en la demo. */
export const DEMO_REGION: RegionalSettings = DEMO_LOCATION_REGIONS['Sede principal'];
export const DEMO_TIME_ZONE: string = DEMO_REGION.timeZone;
export const DEMO_CURRENCY: string = DEMO_REGION.currency;
/**
 * Nombre local que la demo da al documento nacional (DX-327, dato de la
 * clínica puesto en Ajustes; V1 le pone el venezolano): fichas, recibos e
 * importación lo muestran en lugar del genérico «Documento nacional». Se lee
 * de la API, como la pantalla: el spec no escribe nombres de país. Si la
 * clínica no lo ha nombrado, es el genérico.
 */
export async function demoNationalIdLabel(request: APIRequestContext): Promise<string> {
  const session = await demoAdminSession(request);
  const res = await request.get(`${API_URL}/patients/document-type-names`, { headers: session.headers });
  expect(res.ok(), `GET /patients/document-type-names falló: ${await res.text()}`).toBeTruthy();
  const { names } = (await res.json()) as { names: Record<string, string | null> };
  return names.NATIONAL_ID ?? DOC_TYPE_LABEL.NATIONAL_ID;
}

/** Sedes que siembra `seed:demo` (prisma/demo/data.ts de la API). */
export const DEMO_SEEDED_LOCATIONS: string[] = Object.keys(DEMO_LOCATION_REGIONS);

/** Personal que siembra `seed:demo`. */
export const DEMO_SEEDED_STAFF: string[] = [
  'admin@demo.dentalix.app',
  'dentista@demo.dentalix.app',
  'dentista2@demo.dentalix.app',
  'recepcion@demo.dentalix.app',
  'asistente@demo.dentalix.app',
  'recepcion.norte@demo.dentalix.app',
  'dentista.saopaulo@demo.dentalix.app',
  'dentista.londres@demo.dentalix.app',
];

export interface DemoLocation {
  id: string;
  name: string;
  isActive: boolean;
  timeZone: string | null;
}

export function demoAdminSession(request: APIRequestContext): Promise<ApiSession> {
  return apiLogin(request, tenantOrigin(DEMO_SUBDOMAIN), DEMO_ADMIN_EMAIL, DEMO_PASSWORD);
}

export async function listLocations(request: APIRequestContext, session: ApiSession): Promise<DemoLocation[]> {
  const res = await request.get(`${API_URL}/locations`, { headers: session.headers });
  expect(res.ok(), `GET /locations falló: ${await res.text()}`).toBeTruthy();
  return (await res.json()) as DemoLocation[];
}

async function setLocationActive(
  request: APIRequestContext,
  session: ApiSession,
  id: string,
  isActive: boolean,
): Promise<void> {
  const res = await request.patch(`${API_URL}/locations/${id}`, { headers: session.headers, data: { isActive } });
  expect(res.ok(), `PATCH /locations/${id} falló: ${await res.text()}`).toBeTruthy();
}

/**
 * Sede de pruebas con nombre fijo: la reutiliza (reactivándola) si ya existe
 * y la crea solo la primera vez. Así varias ejecuciones sobre la misma base
 * no van sumando sedes; al terminar se retira con `retireDemoLocation`.
 */
export async function reuseDemoLocation(
  request: APIRequestContext,
  session: ApiSession,
  name: string,
): Promise<string> {
  const existing = (await listLocations(request, session)).find((l) => l.name === name);
  if (existing) {
    if (!existing.isActive) await setLocationActive(request, session, existing.id, true);
    return existing.id;
  }
  const res = await request.post(`${API_URL}/locations`, { headers: session.headers, data: { name, ...DEMO_REGION } });
  expect(res.ok(), `POST /locations falló: ${await res.text()}`).toBeTruthy();
  return ((await res.json()) as { id: string }).id;
}

/** Desactiva la sede de pruebas: deja de contar entre las sedes activas de la demo. */
export function retireDemoLocation(request: APIRequestContext, session: ApiSession, id: string): Promise<void> {
  return setLocationActive(request, session, id, false);
}

/**
 * Lo que sobra en la demo respecto de lo sembrado: sedes activas que no son
 * las sembradas y personal que no es el sembrado. Vacío = la demo quedó como
 * la dejó `seed:demo`.
 */
export async function demoLeftovers(
  request: APIRequestContext,
  session: ApiSession,
): Promise<{ locations: string[]; staff: string[] }> {
  const locations = (await listLocations(request, session))
    .filter((l) => l.isActive && !DEMO_SEEDED_LOCATIONS.includes(l.name))
    .map((l) => l.name);
  const res = await request.get(`${API_URL}/staff`, { headers: session.headers });
  expect(res.ok(), `GET /staff falló: ${await res.text()}`).toBeTruthy();
  const staff = ((await res.json()) as { email?: string; fullName: string }[])
    .filter((m) => !m.email || !DEMO_SEEDED_STAFF.includes(m.email))
    .map((m) => m.email ?? m.fullName);
  return { locations, staff };
}
