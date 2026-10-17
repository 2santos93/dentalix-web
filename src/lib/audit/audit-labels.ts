import type { AuditAction, AuditEvent, AuditResourceType } from './audit-api';
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
  PASSWORD_RESET: 'Contraseña restablecida',
  EXPORT: 'Exportación',
  PRINT: 'Impresión',
  // DX-136: enviar el recibo de caja por email.
  SEND: 'Envío por email',
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
  PASSWORD_RESET: 'warning',
  EXPORT: 'muted',
  PRINT: 'muted',
  SEND: 'muted',
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
  CLINICAL_ENTRY_ADDENDUM: 'Adenda de evolución',
  // DX-121: mover una cita (hora y profesional antes/después).
  APPOINTMENT: 'Cita',
  // DX-122: bloqueos de agenda y «Pendientes por agendar».
  SCHEDULE_BLOCK: 'Bloqueo de agenda',
  WAITLIST_ENTRY: 'Pendiente por agendar',
  // DX-048: un ADMIN desbloquea el inicio de sesión de un miembro.
  STAFF_MEMBER: 'Miembro del personal',
  // DX-136: recibo de caja de un abono (ver, reimprimir, enviar).
  PAYMENT_RECEIPT: 'Recibo de caja',
  // DX-170: plantillas de evolución (crear, editar, desactivar, ejemplos).
  CLINICAL_NOTE_TEMPLATE: 'Plantilla de evolución',
  // SEC-009: un ADMIN verifica o elimina un dominio personalizado.
  TENANT_DOMAIN: 'Dominio personalizado',
  // DX-191: registro de implantes, tarjeta y búsqueda por lote.
  PATIENT_IMPLANT: 'Implante',
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

type AuditMetadata = AuditEvent['metadata'];
type AuditOrigin = NonNullable<AuditMetadata['origin']>;

const COMMUNICATION_REASONS: Record<string, string> = {
  COMMUNICATION_PREFERENCES_CHANGED: 'Comunicaciones',
  REMINDER_OPT_OUT: 'Baja de recordatorios',
};

const ORIGIN_LABELS: Record<AuditOrigin, string> = {
  IN_PERSON: 'en persona',
  LINK: 'con el enlace del email',
  MESSAGE: 'respondiendo al mensaje',
  STAFF: 'anotado por el personal',
};

/**
 * DX-128: qué cambió en las comunicaciones del paciente y de dónde salió
 * («Comunicaciones · en persona», «Baja de recordatorios · con el enlace del
 * email»), o null si el evento no es de comunicaciones.
 */
export function communicationDetail(metadata: AuditMetadata): string | null {
  const what = metadata.reason ? COMMUNICATION_REASONS[metadata.reason] : undefined;
  if (!what) return null;
  return metadata.origin ? `${what} · ${ORIGIN_LABELS[metadata.origin]}` : what;
}

/** DX-128: la baja la hizo el propio paciente (el evento no tiene usuario). */
export function isPatientOptOut(metadata: AuditMetadata): boolean {
  return metadata.reason === 'REMINDER_OPT_OUT';
}

/**
 * DX-191: la búsqueda de implantes por lote/REF (y su CSV) dice qué se buscó y
 * cuántas filas salieron: «Lote LOT-1 · 2 filas». null si no es una búsqueda.
 */
export function implantSearchDetail(metadata: AuditMetadata): string | null {
  const search = metadata.search;
  if (!search) return null;
  const terms = [
    search.lot ? `Lote ${search.lot}` : null,
    search.reference ? `REF ${search.reference}` : null,
  ].filter((t): t is string => t !== null);
  const rows = search.rows === 1 ? '1 fila' : `${search.rows} filas`;
  return [...terms, rows].join(' · ');
}
