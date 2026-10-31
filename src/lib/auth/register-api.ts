import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

type RegisterDto = components['schemas']['RegisterDto'];

type RegisterLocationField =
  | 'locationCountry'
  | 'locationCurrency'
  | 'locationTimeZone'
  | 'locationLocale'
  | 'locationHourCycle';

/**
 * Cuerpo de `POST /auth/register` que envía esta web (G1, spec §3.5; G1-B
 * §4.3): la primera sede va SIEMPRE con país, moneda, zona, formato y reloj.
 * Desde DX-312 (R7) la API ya no acepta la forma sin sede.
 */
export type RegisterInput = Omit<RegisterDto, RegisterLocationField> & Required<Pick<RegisterDto, RegisterLocationField>>;

// DX-029: 202 con un mensaje genérico, exista o no el correo. La clínica se
// crea al abrir el enlace del email (/register/verificar/[token]).
export type RegisterResponse = components['schemas']['RegisterAcceptedDto'];

/** Campo de la API (`field` de su 400) → campo regional del formulario. */
export const REGISTER_LOCATION_FIELDS = {
  locationCountry: 'country',
  locationCurrency: 'currency',
  locationTimeZone: 'timeZone',
  locationLocale: 'locale',
  locationHourCycle: 'hourCycle',
} as const;

/** `POST /auth/register` — pide el alta; la clínica se crea al confirmar el correo. */
export async function registerClinic(input: RegisterInput): Promise<RegisterResponse> {
  return apiFetch<RegisterResponse>('/auth/register', { method: 'POST', body: input });
}

export type SubdomainAvailability = components['schemas']['SubdomainAvailability'];

/**
 * Formato de la dirección web, el MISMO que valida la API
 * (`dentalix-api/src/shared/tenancy/subdomain-rules.ts`): etiqueta DNS de
 * minúsculas, números y guiones, 1–63, sin guion al principio ni al final y
 * sin «--» en 3–4 (IDNA). Sin lookbehind (Safari < 16.4). Las reservadas
 * (www, api…) las dice la API: la lista no se copia aquí.
 */
export const SUBDOMAIN_PATTERN = /^(?!.{2}--)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * `GET /public/subdomains/:slug/availability` — ¿se puede registrar? Pública,
 * con límite por IP y sin caché. «available» no la reserva: el envío del
 * registro puede seguir dando 409.
 */
export async function checkSubdomainAvailability(subdomain: string): Promise<SubdomainAvailability> {
  const res = await apiFetch<components['schemas']['SubdomainAvailabilityDto']>(
    `/public/subdomains/${encodeURIComponent(subdomain)}/availability`,
  );
  return res.status;
}
