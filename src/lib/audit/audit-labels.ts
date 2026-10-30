import type { AuditAction, AuditEvent, AuditResourceType } from './audit-api';
import type { ClinicRole } from '@/lib/me/me-api';
import type { BadgeProps } from '@/components/ui/badge';
import { formatDate } from '@/lib/format/date';
import { DOC_TYPE_LABEL, genericDocTypeName } from '@/lib/patients/doc-type';
import type { DocType } from '@/lib/patients/patients-api';

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
  // DX-359: el usuario cambia su propia contraseña (cierra sus demás sesiones).
  PASSWORD_CHANGE: 'Contraseña cambiada',
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
  PASSWORD_CHANGE: 'warning',
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
  // DX-150: cobranza (gestión de cobro y compromiso de pago).
  COLLECTION_NOTE: 'Gestión de cobro',
  PAYMENT_PROMISE: 'Compromiso de pago',
  // DX-204: topes de descuento por rol y umbral del motivo.
  DISCOUNT_POLICY: 'Política de descuentos',
  // DX-210: oferta de un hueco libre a un candidato.
  WAITLIST_OFFER: 'Oferta de hueco',
  CASH_SESSION: 'Caja por turno',
  // DX-212: ítems del catálogo; DX-319: cambios de una sede (nº de registro
  // sanitario con su antes y después).
  DENTAL_CATALOG_ITEM: 'Ítem del catálogo',
  LOCATION: 'Sede',
  // DX-107: lote de importación de pacientes (validar, confirmar, deshacer, informe).
  PATIENT_IMPORT_BATCH: 'Importación de pacientes',
  // DX-222: indicaciones postoperatorias (plantillas y entregas al paciente).
  POSTOP_TEMPLATE: 'Plantilla de indicaciones',
  POSTOP_DELIVERY: 'Indicaciones postoperatorias',
  // DX-151: documentos del paciente (subir, ver, descargar, anular).
  PATIENT_DOCUMENT: 'Documento del paciente',
  // DX-105: listas de precios y convenios (crear, editar, asignar, retirar).
  PRICE_LIST: 'Lista de precios',
  AGREEMENT: 'Convenio',
  // DX-233: horario de un profesional por sede y sus excepciones por fecha.
  PROVIDER_SCHEDULE: 'Horario del profesional',
  // DX-099: anamnesis por enlace (enlace, envío, revisión, anulación).
  MEDICAL_HISTORY_SUBMISSION: 'Anamnesis por enlace',
  // DX-279: nueva versión de la política de cancelación de una sede.
  CANCELLATION_POLICY: 'Política de cancelación',
  // DX-274: gastos de la sede, sus pagos y su soporte.
  EXPENSE: 'Gasto',
  // DX-051: un ADMIN reasigna a qué ítems del plan va un abono.
  PAYMENT_ALLOCATION: 'Imputación de abono',
  // DX-328: ajustes de la clínica (mayoría de edad).
  CLINIC_SETTINGS: 'Ajustes de la clínica',
  // DX-316: días hábiles y festivos de una sede (el resourceId es la sede).
  LOCATION_CALENDAR: 'Calendario de la sede',
  // DX-374: tasa de cambio manual registrada por el ADMIN (el resourceId es la tasa).
  EXCHANGE_RATE: 'Tasa de cambio',
  // DX-359: invitaciones al personal (enviar, reenviar, retirar, sustituir) y
  // alta de la clínica en el registro (el resourceId es la clínica).
  STAFF_INVITATION: 'Invitación al personal',
  CLINIC: 'Clínica',
  PAYMENT_METHOD: 'Medio de pago',
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
  // DX-150: el barrido de cobranza cierra compromisos sin usuario.
  JOB: 'proceso automático',
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

/**
 * DX-128: la baja la hizo el propio paciente (el evento no tiene usuario).
 * DX-099: también el envío de la anamnesis por enlace y su autorización.
 */
export function isPatientOptOut(metadata: AuditMetadata): boolean {
  return (
    metadata.reason === 'REMINDER_OPT_OUT' ||
    metadata.reason === 'ANAMNESIS_SUBMITTED' ||
    metadata.reason === 'ANAMNESIS_LINK'
  );
}

const ANAMNESIS_REASONS: Record<string, string> = {
  ANAMNESIS_LINK_CREATED: 'Enlace de anamnesis creado',
  ANAMNESIS_SUBMITTED: 'Anamnesis enviada por el paciente',
  ANAMNESIS_LINK: 'Autorización de datos de salud dada en el enlace de anamnesis',
  ANAMNESIS_ACCEPTED: 'Anamnesis aceptada en la historia clínica',
  ANAMNESIS_REJECTED: 'Anamnesis rechazada',
  ANAMNESIS_LINK_REVOKED: 'Enlace de anamnesis anulado',
};

/** DX-099: qué pasó con la anamnesis por enlace, o null si no es de ella. */
export function anamnesisDetail(metadata: AuditMetadata): string | null {
  return (metadata.reason && ANAMNESIS_REASONS[metadata.reason]) ?? null;
}

const STAFF_LOGIN_REASONS: Record<string, string> = {
  LOGIN_UNLOCKED: 'Desbloqueo del inicio de sesión',
  LOGIN_UNLOCK_REFUSED: 'Desbloqueo del inicio de sesión rechazado (sin cambios)',
};

/**
 * DX-048 / DX-213: el desbloqueo del login de un miembro y su rechazo se
 * auditan los dos como `Modificación` del miembro; el motivo los distingue.
 * null si el evento no es de desbloqueo.
 */
export function staffLoginDetail(metadata: AuditMetadata): string | null {
  return (metadata.reason && STAFF_LOGIN_REASONS[metadata.reason]) ?? null;
}

const STAFF_REASONS: Record<string, string> = {
  INVITATION_SENT: 'Invitación enviada',
  INVITATION_RESENT: 'Invitación reenviada',
  INVITATION_REVOKED: 'Invitación retirada',
  INVITATION_REPLACED: 'Invitación sustituida por una nueva',
  INVITATION_ACCEPTED: 'Invitación aceptada',
  STAFF_UPDATED: 'Datos del miembro cambiados',
  STAFF_DEACTIVATED: 'Miembro desactivado',
  STAFF_REACTIVATED: 'Miembro reactivado',
  CLINIC_REGISTERED: 'Clínica registrada',
  OWN_NAME_CHANGED: 'Cambió su propio nombre',
  SESSIONS_REVOKED: 'Cambió su contraseña y cerró sus demás sesiones',
  // PUT /staff/:userId/locations (anterior a DX-359): sin antes ni después.
  LOCATIONS_CHANGED: 'Sedes del miembro cambiadas',
};

type StaffAccessSide = NonNullable<NonNullable<AuditMetadata['staffAccess']>['after']>;

/**
 * Nombres de las sedes de la clínica por id (en minúsculas, como los guarda la
 * auditoría), para decir las sedes de `staffAccess` por su nombre.
 */
export type LocationNames = ReadonlyMap<string, string>;

export function locationNameMap(locations: readonly { id: string; name: string }[]): LocationNames {
  return new Map(locations.map((l) => [l.id.toLowerCase(), l.name]));
}

/**
 * Sedes de un lado de `staffAccess` (null = todas). Con los nombres de las
 * sedes, por su nombre; una que ya no está en la clínica (borrada) se cuenta
 * aparte, nunca con su id. Sin los nombres (no cargaron), se cuentan.
 */
function locationsLabel(ids: string[] | null | undefined, names: LocationNames | null): string {
  if (ids === null || ids === undefined) return 'Todas las sedes';
  if (ids.length === 0) return 'ninguna sede';
  if (!names) return ids.length === 1 ? '1 sede' : `${ids.length} sedes`;
  const known: string[] = [];
  let missing = 0;
  for (const id of ids) {
    const name = names.get(id.toLowerCase());
    if (name === undefined) missing += 1;
    else known.push(name);
  }
  known.sort((a, b) => a.localeCompare(b, 'es'));
  if (missing > 0) {
    known.push(missing === 1 ? '1 sede que ya no existe' : `${missing} sedes que ya no existen`);
  }
  return known.join(', ');
}

const STAFF_ACCESS_FIELDS: {
  key: keyof StaffAccessSide;
  label: string;
  value: (side: StaffAccessSide, names: LocationNames | null) => string;
}[] = [
  // Un rol que esta versión de la web no conoce no se pinta en crudo.
  { key: 'role', label: 'Rol', value: (s) => (s.role ? ROLE_LABELS[s.role] ?? 'rol no reconocido' : 'sin rol') },
  { key: 'locationIds', label: 'Sedes', value: (s, names) => locationsLabel(s.locationIds, names) },
  {
    key: 'professionalLicense',
    label: 'Registro profesional',
    value: (s) => (s.professionalLicense ? `«${s.professionalLicense}»` : 'sin registro'),
  },
  {
    key: 'professionalSpecialty',
    label: 'Especialidad',
    value: (s) => (s.professionalSpecialty ? `«${s.professionalSpecialty}»` : 'sin especialidad'),
  },
];

/**
 * DX-359: qué se hizo con una invitación, un miembro, la clínica o la propia
 * cuenta, y los accesos que trae `staffAccess` («Datos del miembro cambiados ·
 * Rol: Asistente → Odontólogo/a · Sedes: Centro → Todas las sedes»). Con los
 * dos lados, antes → después; con solo el de después (una alta), su valor; con
 * solo el de antes, «antes …». Las sedes van por nombre si llegan
 * `locationNames` (si no, se cuentan). El nombre del miembro solo se nombra
 * («Nombre»): su valor nunca viaja. null si el evento no es de personal.
 */
export function staffDetail(
  metadata: AuditMetadata,
  locationNames: LocationNames | null = null,
): string | null {
  const what = metadata.reason ? STAFF_REASONS[metadata.reason] : undefined;
  if (!what) return null;
  const parts = [what];
  if (metadata.reason === 'STAFF_UPDATED' && metadata.changedFields?.includes('fullName')) {
    parts.push('Nombre');
  }
  // Aceptar una invitación puede devolver de alta una membresía desactivada.
  if (
    metadata.reason === 'INVITATION_ACCEPTED' &&
    metadata.statusChange?.from === 'INACTIVE' &&
    metadata.statusChange.to === 'ACTIVE'
  ) {
    parts.push('Miembro reactivado');
  }
  const { before, after } = metadata.staffAccess ?? {};
  for (const field of STAFF_ACCESS_FIELDS) {
    const inBefore = before !== undefined && Object.hasOwn(before, field.key);
    const inAfter = after !== undefined && Object.hasOwn(after, field.key);
    if (inBefore && inAfter) {
      parts.push(
        `${field.label}: ${field.value(before, locationNames)} → ${field.value(after, locationNames)}`,
      );
    } else if (inAfter) {
      parts.push(`${field.label}: ${field.value(after, locationNames)}`);
    } else if (inBefore) {
      parts.push(`${field.label}: antes ${field.value(before, locationNames)}`);
    }
  }
  return parts.join(' · ');
}

/** Si algún lado de `staffAccess` trae sedes concretas (hacen falta sus nombres). */
export function hasStaffLocationIds(metadata: AuditMetadata): boolean {
  const { before, after } = metadata.staffAccess ?? {};
  return [before, after].some((side) => Array.isArray(side?.locationIds) && side.locationIds.length > 0);
}

const CASH_SESSION_REASONS: Record<string, string> = {
  CASH_SESSION_CLOSED: 'Cierre de caja',
  CASH_SESSION_REOPENED: 'Reapertura de caja',
  CASH_SESSION_ADJUSTMENT: 'Ajuste de un cierre',
  CASH_SESSION_CURRENT: 'Caja abierta propia',
  CASH_SETTINGS: 'Ajustes de caja',
};

/** DX-027: qué se hizo con la caja por turno, o null si no es de caja. */
export function cashSessionDetail(metadata: AuditMetadata): string | null {
  return (metadata.reason && CASH_SESSION_REASONS[metadata.reason]) ?? null;
}

const IMPORT_REASONS: Record<string, string> = {
  IMPORT_VALIDATED: 'Validación del archivo',
  IMPORT_CONFIRMED: 'Importación confirmada',
  IMPORT_UNDONE: 'Lote deshecho',
  IMPORT_ERRORS: 'Informe de errores',
};

/**
 * DX-107: qué se hizo con un lote de importación y sus totales (solo números
 * y el inicio del SHA-256 del archivo), o null si no es de importación.
 */
export function importBatchDetail(metadata: AuditMetadata): string | null {
  const what = metadata.reason ? IMPORT_REASONS[metadata.reason] : undefined;
  if (!what) return null;
  const batch = metadata.importBatch;
  if (!batch) return what;
  const parts = [what];
  if (metadata.reason === 'IMPORT_UNDONE') {
    parts.push(`${batch.undoneCreated ?? 0} retirados`, `${batch.undoneFilled ?? 0} revertidos`);
  } else if (batch.rows !== undefined) {
    parts.push(`${batch.rows} filas`, `${batch.valid ?? 0} nuevos`, `${batch.duplicates ?? 0} duplicados`, `${batch.errors ?? 0} con error`);
  }
  parts.push(`SHA-256 ${batch.fileSha256.slice(0, 12)}…`);
  return parts.join(' · ');
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

const WEEKDAY_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function minuteLabel(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

type ScheduleEntry = NonNullable<AuditMetadata['scheduleChange']>['after'][number];

function scheduleEntryLabel(e: ScheduleEntry): string {
  const when =
    e.date !== undefined
      ? `${e.date.slice(8, 10)}/${e.date.slice(5, 7)}`
      : WEEKDAY_SHORT[e.weekday ?? 0];
  if (e.off) return `${when} no trabaja`;
  return `${when} ${minuteLabel(e.startMinute ?? 0)}–${minuteLabel(e.endMinute ?? 0)}`;
}

/**
 * DX-233: horario de un profesional antes y después (semanal o una
 * excepción por fecha): «Antes: lun 08:00–13:00 · Después: …». null si el
 * evento no es un cambio de horario.
 */
export function scheduleChangeDetail(metadata: AuditMetadata): string | null {
  const change = metadata.scheduleChange;
  if (!change) return null;
  const side = (entries: ScheduleEntry[]) =>
    entries.length === 0 ? 'sin horario' : entries.map(scheduleEntryLabel).join(', ');
  return `Antes: ${side(change.before)} · Después: ${side(change.after)}`;
}

/** DX-200: etiqueta de un estado de la cita en el registro de auditoría. */
const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'Agendada',
  CONFIRMED: 'Confirmada',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
  NO_SHOW: 'No asistió',
  ARRIVED: 'En espera',
  IN_CHAIR: 'En sillón',
  READY_FOR_CHECKOUT: 'Listo para cobrar',
};

const PATIENT_FLOW_REASONS: Record<string, string> = {
  PATIENT_FLOW: 'Flujo en la clínica',
  ARRIVAL_UNDONE: 'Deshacer llegada',
};

/**
 * DX-200: un paso del flujo del paciente en la clínica, con el estado antes y
 * después («Flujo en la clínica · Confirmada → En espera»). null si no lo es.
 */
export function patientFlowDetail(metadata: AuditMetadata): string | null {
  const what = metadata.reason ? PATIENT_FLOW_REASONS[metadata.reason] : undefined;
  if (!what) return null;
  const status = metadata.status;
  if (!status) return what;
  const label = (code: string) => APPOINTMENT_STATUS_LABELS[code] ?? code;
  return `${what} · ${label(status.from)} → ${label(status.to)}`;
}


const PLAN_ITEM_ATTRIBUTION_REASONS: Record<string, string> = {
  PLAN_ITEM_ATTRIBUTION_CORRECTED: 'Corrección de quién lo realizó',
  PLAN_ITEM_DONE_REVERTED: 'Se quitó «Realizado»',
};

/**
 * DX-050: un ADMIN corrigió quién o cuándo realizó un ítem del plan, o el ítem
 * salió de «Realizado» («Corrección de quién lo realizó · Fecha 20/10/2026 →
 * 19/10/2026»). La metadata solo trae ids e instantes: se dice qué cambió, no
 * nombres. null si el evento no es de la atribución.
 */
export function planItemAttributionDetail(metadata: AuditMetadata): string | null {
  const what = metadata.reason ? PLAN_ITEM_ATTRIBUTION_REASONS[metadata.reason] : undefined;
  if (!what) return null;
  const change = metadata.attribution;
  if (!change) return what;
  const { before, after } = change;
  const parts = [what];
  if (metadata.reason === 'PLAN_ITEM_DONE_REVERTED') {
    if (before.completedAt) parts.push(`realizado el ${formatDate(before.completedAt)}`);
    return parts.join(' · ');
  }
  if (before.performedById === null) {
    parts.push('Antes sin atribuir');
  } else if (before.performedById !== after.performedById) {
    parts.push('Otro profesional');
  }
  if (before.completedAt && after.completedAt && before.completedAt !== after.completedAt) {
    parts.push(`Fecha ${formatDate(before.completedAt)} → ${formatDate(after.completedAt)}`);
  }
  return parts.join(' · ');
}

const CANCELLATION_KIND_AUDIT: Record<string, string> = {
  PATIENT_LINK: 'el paciente por el enlace',
  STAFF_FOR_PATIENT: 'el paciente avisó',
  CLINIC: 'la clínica',
};

const CANCELLATION_REASON_AUDIT: Record<string, string> = {
  ILLNESS: 'Enfermedad',
  FORGOT: 'Olvido',
  COST: 'Costo',
  TRANSPORT: 'Transporte',
  WORK: 'Trabajo',
  CLINIC_RESCHEDULE: 'La clínica reprograma',
  OTHER: 'Otro',
};

/**
 * DX-279: la cancelación de una cita desde la agenda («Cita cancelada · el
 * paciente avisó · Transporte · aviso de 300 min · tardía») y el cambio de la
 * política de cancelación de una sede («Nueva política de cancelación · v2 ·
 * 24 h»). La metadata solo trae códigos y números. null si no es ninguno.
 */
export function cancellationDetail(metadata: AuditMetadata): string | null {
  if (metadata.reason === 'CANCELLATION_POLICY_CHANGED') return 'Nueva versión de la política de cancelación';
  // DX-291: cargo por inasistencia o cancelación tardía y su condonación
  // (el motivo de la condonación nunca viaja en la metadata).
  if (metadata.reason === 'CANCELLATION_FEE_CHARGED') return 'Cargo por inasistencia o cancelación tardía';
  if (metadata.reason === 'CANCELLATION_FEE_WAIVED') return 'Cargo por inasistencia condonado';
  // SEC-050: anulación con motivo de un cargo ya generado (sin el texto).
  if (metadata.reason === 'CANCELLATION_FEE_VOIDED') return 'Cargo por inasistencia anulado';
  if (metadata.reason !== 'APPOINTMENT_CANCELLED') return null;
  const c = metadata.cancellation;
  if (!c) return 'Cita cancelada';
  const parts = ['Cita cancelada', CANCELLATION_KIND_AUDIT[c.byKind] ?? c.byKind];
  if (c.reasonCode) parts.push(CANCELLATION_REASON_AUDIT[c.reasonCode] ?? c.reasonCode);
  parts.push(`aviso de ${c.noticeMinutes} min`);
  if (c.lateCancellation) parts.push('tardía');
  return parts.join(' · ');
}

/**
 * DX-319: el nº de registro sanitario de una sede y si sale en los documentos,
 * antes y después («Nº de registro sanitario: sin nº → «NRS-7» · En los
 * documentos: no → sí»). Solo lo que cambió. null si el evento no lo trae.
 */
export function healthRegistrationDetail(metadata: AuditMetadata): string | null {
  const change = metadata.healthRegistration;
  if (!change) return null;
  const { before, after } = change;
  const number = (n: string | null) => (n === null ? 'sin nº' : `«${n}»`);
  const shown = (s: boolean) => (s ? 'sí' : 'no');
  const parts: string[] = [];
  if (before.number !== after.number) {
    parts.push(`Nº de registro sanitario: ${number(before.number)} → ${number(after.number)}`);
  }
  if (before.shown !== after.shown) {
    parts.push(`En los documentos: ${shown(before.shown)} → ${shown(after.shown)}`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** Edad de un `statusChange` de ajustes de la clínica (`AGE_18` → 18), o null. */
function ageOf(code: string): string | null {
  const match = /^AGE_(\d+)$/.exec(code);
  return match ? match[1] : null;
}

interface PrescriptionSettingsCode {
  words: boolean;
  record: boolean;
  days: string;
}

/** Ajustes de la receta de un `statusChange` (`RX_W1_H0_V30`), o null. */
function prescriptionSettingsOf(code: string): PrescriptionSettingsCode | null {
  const match = /^RX_W([01])_H([01])_V(\d+)$/.exec(code);
  return match ? { words: match[1] === '1', record: match[2] === '1', days: match[3] } : null;
}

/**
 * DX-324: el cambio de los ajustes de la receta, solo lo que cambió («Receta:
 * cantidad en letras sí → no; validez 30 → 10 días»). null si los códigos no
 * casan o no cambia nada.
 */
function prescriptionSettingsDetail(from: string, to: string): string | null {
  const before = prescriptionSettingsOf(from);
  const after = prescriptionSettingsOf(to);
  if (!before || !after) return null;
  const yesNo = (v: boolean) => (v ? 'sí' : 'no');
  const parts: string[] = [];
  if (before.words !== after.words) {
    parts.push(`cantidad en letras ${yesNo(before.words)} → ${yesNo(after.words)}`);
  }
  if (before.record !== after.record) {
    parts.push(`nº de historia clínica exigido ${yesNo(before.record)} → ${yesNo(after.record)}`);
  }
  if (before.days !== after.days) {
    // La unidad concuerda con el número que tiene al lado: el de después.
    const unit = after.days === '1' ? 'día' : 'días';
    parts.push(`validez ${before.days} → ${after.days} ${unit}`);
  }
  return parts.length > 0 ? `Receta: ${parts.join('; ')}` : null;
}

/** DX-327: «Nombres de documentos: …» con el nombre genérico de cada tipo cambiado. */
function documentTypeNamesDetail(changedFields: string[] | undefined): string | null {
  if (!changedFields || changedFields.length === 0) return null;
  const names: string[] = [];
  for (const field of changedFields) {
    if (!Object.hasOwn(DOC_TYPE_LABEL, field)) return null;
    names.push(genericDocTypeName(field as DocType));
  }
  return `Nombres de documentos: ${names.join(', ')}`;
}

/**
 * Un cambio de ajustes de la clínica, antes y después. DX-328: la mayoría de
 * edad («Mayoría de edad: 18 → 16 años»). DX-324: los ajustes de la receta.
 * null si el evento no es de uno de esos ajustes.
 */
const EXCHANGE_RATE_SOURCE_LABELS: Record<string, string> = {
  AUTOMATIC: 'automática',
  MANUAL: 'manual',
};

/** DX-374: fuente de la tasa de cambio antes y después, o null con códigos desconocidos. */
function exchangeRateSourceDetail(from: string, to: string): string | null {
  const before = EXCHANGE_RATE_SOURCE_LABELS[from];
  const after = EXCHANGE_RATE_SOURCE_LABELS[to];
  if (!before || !after) return null;
  return `Tasa de cambio: ${before} → ${after}`;
}

export function clinicSettingsDetail(metadata: AuditMetadata): string | null {
  // DX-327: sin `statusChange` ni valores (son texto libre); va antes del
  // `return null` de abajo o no llegaría nunca.
  if (metadata.reason === 'DOCUMENT_TYPE_NAMES_SETTINGS') {
    return documentTypeNamesDetail(metadata.changedFields);
  }
  if (!metadata.statusChange) return null;
  const { from, to } = metadata.statusChange;
  if (metadata.reason === 'PRESCRIPTION_SETTINGS') return prescriptionSettingsDetail(from, to);
  if (metadata.reason === 'EXCHANGE_RATE_SOURCE') return exchangeRateSourceDetail(from, to);
  if (metadata.reason !== 'MAJORITY_AGE_SETTINGS') return null;
  const before = ageOf(from);
  const after = ageOf(to);
  if (before === null || after === null) return null;
  return `Mayoría de edad: ${before} → ${after} años`;
}

const LOCATION_CALENDAR_REASONS: Record<string, string> = {
  WORKING_WEEKDAYS_CHANGED: 'Días hábiles cambiados',
  HOLIDAY_CREATED: 'Festivo añadido',
  HOLIDAY_UPDATED: 'Festivo editado',
  HOLIDAY_DELETED: 'Festivo eliminado',
  HOLIDAYS_IMPORTED: 'Festivos importados',
};

/** DX-316: qué cambió en el calendario de una sede, o null si el evento no es de él. */
export function locationCalendarDetail(metadata: AuditMetadata): string | null {
  return (metadata.reason && LOCATION_CALENDAR_REASONS[metadata.reason]) ?? null;
}
