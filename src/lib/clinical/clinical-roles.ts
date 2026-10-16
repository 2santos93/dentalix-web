import type { ClinicRole } from '@/lib/me/me-api';

/**
 * Quién lee y escribe historia clínica (anamnesis, evoluciones, odontograma):
 * los mismos roles que la API (`CLINICAL_ROLES`), todos menos recepción. Solo
 * decide qué se PINTA; el servidor vuelve a comprobarlo (p. ej. `POST
 * /patients` con `medicalHistory` desde recepción responde 403).
 */
export const CLINICAL_ROLES: readonly ClinicRole[] = ['DENTIST', 'ASSISTANT', 'ADMIN'];

/** `null` (sin sesión de clínica legible) cuenta como "sin permiso". */
export function canWriteClinicalHistory(role: ClinicRole | null): boolean {
  return role !== null && CLINICAL_ROLES.includes(role);
}
