import type { ClinicRole } from '@/lib/me/me-api';

// DX-190: quién ve y escribe la ortodoncia (los mismos conjuntos que la API).

/** Leer el caso y sus controles: historia clínica (CLINICAL_ROLES en la API). */
export function canReadOrtho(role: ClinicRole | null): boolean {
  return role === 'ADMIN' || role === 'DENTIST' || role === 'ASSISTANT';
}

/** Abrir, editar y cerrar el caso y registrar controles: ORTHO_WRITE_ROLES. */
export function canWriteOrtho(role: ClinicRole | null): boolean {
  return role === 'ADMIN' || role === 'DENTIST';
}

/** Cambiar los ajustes de ortodoncia: solo ADMIN. */
export function canManageOrthoSettings(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/** Pacientes › Ortodoncia. */
export const ORTHO_FOLLOW_UP_HREF = '/patients/ortodoncia';

/** Ficha del paciente en la pestaña de ortodoncia; con cita, abre «Registrar control». */
export function orthoTabHref(patientId: string, appointmentId?: string): string {
  const base = `/patients/${encodeURIComponent(patientId)}?tab=ortho`;
  return appointmentId ? `${base}&orthoVisitAppointment=${encodeURIComponent(appointmentId)}` : base;
}
