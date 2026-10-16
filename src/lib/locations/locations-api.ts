import { apiFetch } from '@/lib/api/client';

export interface ClinicLocation {
  id: string;
  name: string;
  address: string | null;
  /** País de la sede (DX-013): decide los campos legales de la receta. */
  country: 'CO' | 'ES';
  isActive: boolean;
  /**
   * Zona IANA de la sede (DX-097): la de su horario o, sin horario, la de su
   * país. Decide qué es «hoy» en la caja y el dashboard.
   */
  timeZone: string;
  createdAt: string;
}

/** `GET /locations` — sedes de la clínica, la principal primero. */
export async function listLocations(token: string): Promise<ClinicLocation[]> {
  return apiFetch<ClinicLocation[]>('/locations', { token });
}
