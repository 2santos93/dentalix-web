import { apiFetch } from '@/lib/api/client';

export interface ClinicLocation {
  id: string;
  name: string;
  address: string | null;
  isActive: boolean;
  createdAt: string;
}

/** `GET /locations` — sedes de la clínica, la principal primero. */
export async function listLocations(token: string): Promise<ClinicLocation[]> {
  return apiFetch<ClinicLocation[]>('/locations', { token });
}
