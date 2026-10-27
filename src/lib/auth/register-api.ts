import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

type RegisterDto = components['schemas']['RegisterDto'];

/**
 * Cuerpo de `POST /auth/register` que envía esta web (G1, spec §3.5): la
 * primera sede va SIEMPRE con país, moneda, zona y formato. La API acepta aún
 * la forma legada sin ellos (webs antiguas, fase 1); esta web no la usa.
 */
export type RegisterInput = Omit<
  RegisterDto,
  'locationCountry' | 'locationCurrency' | 'locationTimeZone' | 'locationLocale'
> &
  Required<Pick<RegisterDto, 'locationCountry' | 'locationCurrency' | 'locationTimeZone' | 'locationLocale'>>;

// DX-029: 202 con un mensaje genérico, exista o no el correo. La clínica se
// crea al abrir el enlace del email (/register/verificar/[token]).
export type RegisterResponse = components['schemas']['RegisterAcceptedDto'];

/** Campo de la API (`field` de su 400) → campo regional del formulario. */
export const REGISTER_LOCATION_FIELDS = {
  locationCountry: 'country',
  locationCurrency: 'currency',
  locationTimeZone: 'timeZone',
  locationLocale: 'locale',
} as const;

/** `POST /auth/register` — pide el alta; la clínica se crea al confirmar el correo. */
export async function registerClinic(input: RegisterInput): Promise<RegisterResponse> {
  return apiFetch<RegisterResponse>('/auth/register', { method: 'POST', body: input });
}
