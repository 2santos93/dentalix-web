import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

// `ClinicRole` isn't exposed as its own named schema component (it only shows
// up inline wherever a DTO references it) — re-declare the literal union here
// mirroring `dentalix-api`'s Prisma `ClinicRole` enum. Keep in sync if it
// changes.
export type ClinicRole = 'DENTIST' | 'ASSISTANT' | 'RECEPTION' | 'ADMIN';

type StaffMemberDto = components['schemas']['StaffMemberDto'];

/**
 * Fila de `GET /staff` (`StaffMemberDto`) con lo que usa la agenda. El DTO
 * marca `locationIds` como opcional porque el `PATCH` no lo devuelve, pero
 * `GET /staff` lo manda siempre (DX-089): `null` = todas las sedes.
 */
export type StaffMember = Pick<StaffMemberDto, 'userId' | 'fullName' | 'role'> & {
  locationIds: string[] | null;
};

export async function listStaff(token: string): Promise<StaffMember[]> {
  return apiFetch<StaffMember[]>('/staff', {
    token,
  });
}
