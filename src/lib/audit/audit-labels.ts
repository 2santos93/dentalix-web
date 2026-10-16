import type { AuditAction, AuditResourceType } from './audit-api';
import type { ClinicRole } from '@/lib/me/me-api';
import type { BadgeProps } from '@/components/ui/badge';

// Copy en español (i18n-ready), como el resto de etiquetas de dominio.

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  VIEW: 'Consulta',
  CREATE: 'Alta',
  UPDATE: 'Modificación',
  DELETE: 'Eliminación',
  SIGN: 'Firma',
  VOID: 'Anulación',
  LOGIN: 'Inicio de sesión',
  LOGIN_FAILED: 'Inicio de sesión fallido',
  EXPORT: 'Exportación',
  PRINT: 'Impresión',
};

export const AUDIT_ACTION_OPTIONS = Object.keys(AUDIT_ACTION_LABELS) as AuditAction[];

/**
 * Tono de la etiqueta: neutro para leer, ámbar para lo que cambia o retira un
 * dato, rojo solo para el login fallido (lo único que es una alerta).
 */
export const AUDIT_ACTION_VARIANT: Record<AuditAction, NonNullable<BadgeProps['variant']>> = {
  VIEW: 'muted',
  CREATE: 'success',
  UPDATE: 'warning',
  DELETE: 'warning',
  SIGN: 'success',
  VOID: 'warning',
  LOGIN: 'muted',
  LOGIN_FAILED: 'danger',
  EXPORT: 'muted',
  PRINT: 'muted',
};

export const AUDIT_RESOURCE_LABELS: Record<AuditResourceType, string> = {
  SESSION: 'Sesión',
  PATIENT: 'Ficha del paciente',
  MEDICAL_HISTORY: 'Historia clínica',
  CLINICAL_ENTRY: 'Evolución',
  ODONTOGRAM: 'Odontograma',
  PERIO_EXAM: 'Periodontograma',
  CONSENT: 'Consentimiento',
  DATA_CONSENT: 'Autorización de datos',
  PRESCRIPTION: 'Receta',
  TREATMENT_PLAN: 'Plan de tratamiento',
  TREATMENT_PLAN_ITEM: 'Ítem del plan',
  PAYMENT: 'Abono',
  PAYMENT_PLAN: 'Plan de cuotas',
  ACCOUNT_STATEMENT: 'Estado de cuenta',
};

export const AUDIT_RESOURCE_OPTIONS = Object.keys(AUDIT_RESOURCE_LABELS) as AuditResourceType[];

const ROLE_LABELS: Record<ClinicRole, string> = {
  ADMIN: 'Administrador/a',
  DENTIST: 'Odontólogo/a',
  ASSISTANT: 'Asistente',
  RECEPTION: 'Recepción',
};

/** Rol con el que actuó; un login fallido no tiene sesión. */
export function actorRoleLabel(role: ClinicRole | null): string {
  return role ? ROLE_LABELS[role] : 'Sin sesión';
}
