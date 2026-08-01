import { apiFetch, apiFetchOrNull } from '@/lib/api/client';

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
}

export interface UpdateStaffInput {
  fullName?: string;
  role?: ClinicRole;
}

export async function listStaff(token: string): Promise<StaffMember[]> {
  return apiFetch<StaffMember[]>('/staff', {
    token,
  });
}

/** `PATCH /staff/:userId` — update `fullName` and/or `role`. */
export async function updateStaff(
  token: string,
  userId: string,
  patch: UpdateStaffInput,
): Promise<StaffMember> {
  return apiFetch<StaffMember>(`/staff/${userId}`, {
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
 * surfaces `err.message`.
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
}

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
