import { apiFetch } from '@/lib/api/client';

// `ClinicRole` isn't exposed as its own named schema component (it only shows
// up inline wherever a DTO references it) — re-declare the literal union here
// mirroring `dentalix-api`'s Prisma `ClinicRole` enum. Keep in sync if it
// changes.
export type ClinicRole = 'OWNER' | 'DENTIST' | 'ASSISTANT' | 'RECEPTION' | 'ADMIN';

/**
 * `GET /staff` returns the plain TS `StaffMember` interface on the backend
 * (`src/modules/staff/domain/entities/staff-member.entity.ts`), not a class
 * decorated with `@ApiProperty()` — same situation as `Appointment`/`Patient`
 * — so the generated `schema.d.ts` has no body shape for this route
 * (`content?: never`). Hand-written to mirror that entity — keep in sync if
 * it changes.
 */
export interface StaffMember {
  userId: string;
  fullName: string;
  role: ClinicRole;
}

export async function listStaff(token: string): Promise<StaffMember[]> {
  return apiFetch<StaffMember[]>('/staff', {
    token,
  });
}
