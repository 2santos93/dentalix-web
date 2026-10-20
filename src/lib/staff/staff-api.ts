import { apiFetch, apiFetchOrNull } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

// `ClinicRole` isn't exposed as its own named schema component (it only shows
// up inline wherever a DTO references it) — re-declare the literal union here
// mirroring `dentalix-api`'s Prisma `ClinicRole` enum, same convention as
// `src/lib/appointments/staff-api.ts`. Keep in sync if it changes.
export type ClinicRole = 'DENTIST' | 'ASSISTANT' | 'RECEPTION' | 'ADMIN';

/**
 * `GET /staff` (and the `PATCH` response below) return the plain TS
 * `StaffMember` interface on the backend
 * (`src/modules/staff/domain/entities/staff-member.entity.ts`), not a class
 * decorated with `@ApiProperty()` — same situation as `Appointment`/`Patient`
 * — so the generated `schema.d.ts` has no body shape for these routes
 * (`content?: never`). Hand-written to mirror that entity — keep in sync if
 * it changes.
 *
 * Unlike `src/lib/appointments/staff-api.ts`'s `StaffMember` (which only
 * needs `userId`/`fullName`/`role` for the agenda's provider selector), this
 * module's staff-management screen also lists/edits `email`, so it's added
 * here.
 */
export interface StaffMember {
  userId: string;
  fullName: string;
  email: string;
  role: ClinicRole;
  /**
   * DX-089: sedes en las que trabaja; `null` = todas (y siempre `null` en un
   * ADMIN). Opcional solo por las respuestas que no lo traen (`PATCH`).
   */
  locationIds?: string[] | null;
}

export interface UpdateStaffInput {
  fullName?: string;
  role?: ClinicRole;
  /** Registro profesional / nº de colegiado (DX-013); `''` lo borra. */
  professionalLicense?: string;
}

export async function listStaff(token: string): Promise<StaffMember[]> {
  return apiFetch<StaffMember[]>('/staff', {
    token,
  });
}

/**
 * `PATCH /staff/:userId` — update `fullName`, `role` and/or
 * `professionalLicense` (the response carries the license too).
 */
export async function updateStaff(
  token: string,
  userId: string,
  patch: UpdateStaffInput,
): Promise<StaffMember & { professionalLicense?: string | null }> {
  return apiFetch<StaffMember & { professionalLicense?: string | null }>(`/staff/${userId}`, {
    method: 'PATCH',
    body: patch,
    token,
  });
}

/**
 * `DELETE /staff/:userId` — soft-deactivates the staff member. The backend
 * returns `204` with an EMPTY body on success, which `apiFetch`'s
 * `res.json()` would throw on (same situation as `GET
 * /patients/:id/medical-history`, see `client.ts`'s `apiFetchOrNull` doc
 * comment) — use `apiFetchOrNull` and discard the (always-null) result.
 * Returns 409 if you try to deactivate the last admin or yourself; that
 * throws `ApiError` same as any other non-ok response, and the caller
 * shows it in Spanish via `apiErrorMessage` (with a 409 override).
 */
export async function deactivateStaff(token: string, userId: string): Promise<void> {
  await apiFetchOrNull<null>(`/staff/${userId}`, {
    method: 'DELETE',
    token,
  });
}

// ---------------------------------------------------------------------------
// Directorio: la pantalla de gestión de Personal
// ---------------------------------------------------------------------------

/**
 * `GET /staff` sigue devolviendo la lista COMPLETA sin paginar porque alimenta
 * selectores (profesional de una cita, filtro de la agenda, dashboard). El
 * directorio de abajo es lo contrario: una página filtrada que mezcla miembros
 * e invitaciones para la pantalla de gestión. Son dos necesidades distintas y
 * por eso son dos endpoints.
 */
export type StaffDirectoryStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING';

export interface StaffDirectoryEntry {
  /** `MEMBER` tiene perfil que abrir; `INVITATION` solo se reenvía o revoca. */
  kind: 'MEMBER' | 'INVITATION';
  /** `userId` si es MEMBER, id de la invitación si no. Léelo junto a `kind`. */
  id: string;
  fullName: string;
  email: string;
  role: ClinicRole;
  status: StaffDirectoryStatus;
  /** Caducidad del enlace; `null` en los miembros. */
  expiresAt: string | null;
  /**
   * Estado del último email con el enlace (DX-088): `PENDING` (por enviar o
   * saliendo), `SENT`, `FAILED`; `null` en los miembros o si nunca se encoló.
   */
  emailDelivery: InvitationEmailDelivery | null;
}

/** Estado del email de una invitación, tal como lo genera el contrato. */
export type InvitationEmailDelivery = NonNullable<
  components['schemas']['StaffDirectoryEntryDto']['emailDelivery']
>;

export interface StaffDirectoryPage {
  items: StaffDirectoryEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface StaffDirectoryFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: ClinicRole;
  status?: StaffDirectoryStatus;
}

/** `GET /staff/directory` — página del directorio unificado. */
export async function listStaffDirectory(
  token: string,
  filters: StaffDirectoryFilters = {},
): Promise<StaffDirectoryPage> {
  const qs = new URLSearchParams();
  if (filters.page) qs.set('page', String(filters.page));
  if (filters.pageSize) qs.set('pageSize', String(filters.pageSize));
  // Se omiten los vacíos en vez de mandarlos: `search=` haría que el backend
  // trate "sin búsqueda" como una búsqueda de cadena vacía.
  if (filters.search) qs.set('search', filters.search);
  if (filters.role) qs.set('role', filters.role);
  if (filters.status) qs.set('status', filters.status);
  const query = qs.toString();
  return apiFetch<StaffDirectoryPage>(`/staff/directory${query ? `?${query}` : ''}`, {
    token,
  });
}

export interface StaffMemberDetail extends StaffMember {
  status: 'ACTIVE' | 'INACTIVE';
  /** Registro profesional (CO) / nº de colegiado (ES) que exige la receta (DX-013). */
  professionalLicense?: string | null;
  /**
   * DX-048: hasta cuándo no puede iniciar sesión por intentos fallidos (ISO);
   * `null` = sin bloqueo.
   */
  loginBlockedUntil: components['schemas']['StaffMemberDetailDto']['loginBlockedUntil'];
}

/**
 * `GET /staff/:userId` — perfil del miembro. Devuelve también a los
 * desactivados (con `status: 'INACTIVE'`), porque su perfil es justo desde
 * donde se les reactiva.
 */
export async function getStaffMember(
  token: string,
  userId: string,
): Promise<StaffMemberDetail> {
  return apiFetch<StaffMemberDetail>(`/staff/${userId}`, { token });
}

/** `POST /staff/:userId/reactivate` — devuelve el acceso a un desactivado. */
export async function reactivateStaff(
  token: string,
  userId: string,
): Promise<StaffMember> {
  return apiFetch<StaffMember>(`/staff/${userId}/reactivate`, {
    method: 'POST',
    token,
  });
}

/**
 * `POST /staff/:userId/login-unlock` (DX-048, solo ADMIN) — quita la espera
 * por intentos fallidos y los fallos acumulados. 204 sin cuerpo; idempotente.
 */
export async function unlockStaffLogin(token: string, userId: string): Promise<void> {
  await apiFetchOrNull<null>(`/staff/${userId}/login-unlock`, {
    method: 'POST',
    token,
  });
}

// ---------------------------------------------------------------------------
// Sedes permitidas del miembro (DX-089, solo ADMIN)
// ---------------------------------------------------------------------------

// TODO(DX-089 T7): sustituir por components['schemas'][…] tras npm run codegen
/** `all: true` = todas las sedes (entonces `locationIds` llega vacío). */
export interface StaffLocations {
  all: boolean;
  locationIds: string[];
}

/** `GET /staff/:userId/locations` — sedes en las que puede trabajar el miembro. */
export async function getStaffLocations(token: string, userId: string): Promise<StaffLocations> {
  return apiFetch<StaffLocations>(`/staff/${userId}/locations`, { token });
}

/**
 * `PUT /staff/:userId/locations` — reemplaza sus sedes; `[]` = todas. 409 si
 * el miembro es ADMIN; 400 si alguna sede no es de la clínica. El cambio se
 * aplica cuando el miembro renueva su sesión (como mucho 15 minutos).
 */
export async function replaceStaffLocations(
  token: string,
  userId: string,
  locationIds: string[],
): Promise<StaffLocations> {
  return apiFetch<StaffLocations>(`/staff/${userId}/locations`, {
    method: 'PUT',
    body: { locationIds },
    token,
  });
}
