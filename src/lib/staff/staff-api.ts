import { apiFetch, apiFetchOrNull } from '@/lib/api/client';

// `ClinicRole` isn't exposed as its own named schema component (it only shows
// up inline wherever a DTO references it) — re-declare the literal union here
// mirroring `dentalix-api`'s Prisma `ClinicRole` enum, same convention as
// `src/lib/appointments/staff-api.ts`. Keep in sync if it changes.
export type ClinicRole = 'DENTIST' | 'ASSISTANT' | 'RECEPTION' | 'ADMIN';

/**
 * `GET /staff` (and the `POST`/`PATCH` responses below) return the plain TS
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

export interface CreateStaffInput {
  fullName: string;
  email: string;
  role: ClinicRole;
  password: string;
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

export async function createStaff(
  token: string,
  input: CreateStaffInput,
): Promise<StaffMember> {
  return apiFetch<StaffMember>('/staff', {
    method: 'POST',
    body: input,
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
