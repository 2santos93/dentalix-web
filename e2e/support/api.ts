import { expect, type APIRequestContext } from '@playwright/test';
import type { RegisterAndLoginParams } from './auth';
import { API_URL, tenantOrigin } from './urls';
import { invitationLinkFor, registrationTokenFor } from './mail';
import { E2E_REGION, type RegionalSettings } from './regional';

/**
 * Siembra por la API, sin pasar por la UI (DX-070): para preparar en un
 * `beforeAll` lo que el test no está probando (clínica, paciente, personal).
 *
 * La API resuelve la clínica por el host: cada llamada lleva `X-Tenant-Host`
 * con el host de la web de esa clínica, igual que hace el navegador.
 */
export interface ApiSession {
  origin: string;
  /** Cabeceras de una llamada autenticada en la clínica. */
  headers: Record<string, string>;
}

/** `POST /auth/login` por la API: el par llega en el cuerpo (sin cookie). */
export async function apiLogin(
  request: APIRequestContext,
  origin: string,
  email: string,
  password: string,
): Promise<ApiSession> {
  const host = new URL(origin).host;
  const res = await request.post(`${API_URL}/auth/login`, {
    headers: { 'X-Tenant-Host': host },
    data: { email, password },
  });
  expect(res.ok(), `login por la API falló: ${await res.text()}`).toBeTruthy();
  const { accessToken } = (await res.json()) as { accessToken: string };
  return { origin, headers: { Authorization: `Bearer ${accessToken}`, 'X-Tenant-Host': host } };
}

/**
 * Registra una clínica nueva por la API e inicia sesión con su dueño (ADMIN).
 * DX-029: el registro (202) no crea nada hasta abrir el enlace del email, así
 * que se lee del buzón de e2e y se confirma con `POST /auth/register/verify`.
 * G1 (DX-317) y G1-B (DX-350): la primera sede nace con los cinco valores
 * regionales, reloj incluido (`clinic.location`, por defecto `E2E_REGION`).
 */
export async function registerClinicViaApi(
  request: APIRequestContext,
  clinic: RegisterAndLoginParams,
): Promise<ApiSession> {
  const host = new URL(tenantOrigin(clinic.subdomain)).host;
  const region: RegionalSettings = { ...E2E_REGION, ...clinic.location };
  const res = await request.post(`${API_URL}/auth/register`, {
    headers: { 'X-Tenant-Host': host },
    data: {
      clinicName: clinic.clinicName,
      subdomain: clinic.subdomain,
      fullName: clinic.fullName,
      email: clinic.email,
      password: clinic.password,
      locationCountry: region.country,
      locationCurrency: region.currency,
      locationTimeZone: region.timeZone,
      locationLocale: region.locale,
      locationHourCycle: region.hourCycle,
    },
  });
  expect(res.status(), `registro por la API falló: ${await res.text()}`).toBe(202);
  const token = await registrationTokenFor(clinic.email);
  const verify = await request.post(`${API_URL}/auth/register/verify`, {
    data: { token, password: clinic.password },
  });
  expect(verify.ok(), `confirmar el registro falló: ${await verify.text()}`).toBeTruthy();
  return apiLogin(request, tenantOrigin(clinic.subdomain), clinic.email, clinic.password);
}

/** POST autenticado que debe salir bien; devuelve el cuerpo. */
export async function apiPost<T>(
  request: APIRequestContext,
  session: ApiSession,
  path: string,
  data: object,
): Promise<T> {
  const res = await request.post(`${API_URL}${path}`, { headers: session.headers, data });
  expect(res.ok(), `POST ${path} falló: ${await res.text()}`).toBeTruthy();
  return (await res.json()) as T;
}

/**
 * Alta de una sede (`POST /locations`, ADMIN) con los cinco valores regionales
 * explícitos (G1-B): país, moneda, zona, formato y reloj. Devuelve su `id`.
 */
export async function createLocationViaApi(
  request: APIRequestContext,
  session: ApiSession,
  location: { name: string } & RegionalSettings,
): Promise<string> {
  return (await apiPost<{ id: string }>(request, session, '/locations', location)).id;
}

/**
 * Da de alta a una persona del equipo por el camino real: el ADMIN la invita
 * (`POST /staff/invitations`), el enlace le llega por email (DX-029: el ADMIN
 * ya no recibe el token) y ella acepta con su contraseña
 * (`POST /public/invitations/:token/accept`).
 */
export async function addStaffViaApi(
  request: APIRequestContext,
  admin: ApiSession,
  person: { fullName: string; email: string; role: string; password: string },
): Promise<void> {
  await apiPost<object>(request, admin, '/staff/invitations', {
    fullName: person.fullName,
    email: person.email,
    role: person.role,
  });
  const token = (await invitationLinkFor(person.email, admin.origin)).split('/').pop()!;
  const res = await request.post(`${API_URL}/public/invitations/${token}/accept`, {
    headers: { 'X-Tenant-Host': admin.headers['X-Tenant-Host'] },
    data: { password: person.password },
  });
  expect(res.ok(), `aceptar la invitación falló: ${await res.text()}`).toBeTruthy();
}
