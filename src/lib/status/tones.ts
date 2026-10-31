import type { components } from '@/lib/api/schema';

type Schemas = components['schemas'];

/**
 * El vocabulario de estados de Dentalix (DESIGN.md → Status tones), en UN solo
 * mapa: cada estado de dominio → tono + etiqueta. Ninguna pantalla decide el
 * color de un estado por su cuenta; todas pasan por aquí (`StatusBadge`,
 * `statusTone`, `statusLabel`).
 *
 * Regla de tonos (investigación UX v2 §2.2, reglas de etiquetas del NHS):
 * - success: hecho y bien — atendida, pagada, completada, vigente.
 * - warning: pide una acción o una espera — pendiente, parcial, por vencer, en espera.
 * - danger: salió mal o venció — no asistió, vencida, rechazada, falló.
 * - info: en curso y reconocido — confirmada, en sillón, aceptado, abierta.
 * - neutral: aún nada o ya cerrado sin juicio — borrador, agendada, cancelada, anulada.
 *
 * El acento de la clínica NUNCA es un tono de estado: es configurable por
 * clínica y una clínica roja o verde haría que «Confirmada» se leyera como
 * alarma o como éxito.
 *
 * Cada mapa se tipa con el enum del esquema de la API (`satisfies Record<…>`):
 * un estado nuevo en el backend rompe `tsc` hasta que alguien le da tono y
 * etiqueta aquí. Las etiquetas son adjetivos en mayúscula inicial y reutilizan
 * literalmente el texto que la interfaz ya mostraba.
 */
export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface StatusPresentation {
  readonly tone: StatusTone;
  readonly label: string;
}

type Presentations<K extends string> = Record<K, StatusPresentation>;

const s = (tone: StatusTone, label: string): StatusPresentation => ({ tone, label });

// ── Clínica: sedación ───────────────────────────────────────────────────────

/** Hoja de sedación: valorada, checklist y en curso son pasos en marcha; el egreso la cierra bien. */
const sedationSheet = {
  ASSESSED: s('info', 'Valorada'),
  CHECKED: s('info', 'Checklist hecho'),
  IN_PROGRESS: s('info', 'En curso'),
  DISCHARGED: s('success', 'Egreso firmado'),
} satisfies Presentations<Schemas['SedationSheetDto']['status']>;

// ── Agenda ──────────────────────────────────────────────────────────────────

const appointment = {
  SCHEDULED: s('neutral', 'Agendada'),
  CONFIRMED: s('info', 'Confirmada'),
  COMPLETED: s('success', 'Completada'),
  CANCELLED: s('neutral', 'Cancelada'),
  NO_SHOW: s('danger', 'No asistió'),
  // DX-200: el paciente en la clínica. En espera pide que alguien lo pase; en
  // el sillón está en curso; listo para cobrar pide el cobro.
  ARRIVED: s('warning', 'En espera'),
  IN_CHAIR: s('info', 'En sillón'),
  READY_FOR_CHECKOUT: s('warning', 'Listo para cobrar'),
} satisfies Presentations<Schemas['AppointmentStatus']>;

/** Puntualidad de la llegada (DX-200); el chip muestra los minutos en el estado y toma el tono de aquí. */
const punctuality = {
  ON_TIME: s('success', 'A tiempo'),
  LATE: s('warning', 'Hasta 5 min tarde'),
  VERY_LATE: s('danger', 'Más de 5 min tarde'),
} satisfies Presentations<NonNullable<Schemas['InClinicItemDto']['punctuality']>>;

/** Envío de un recordatorio por email. SENT y SKIPPED llevan detalle: la vista pasa su propio texto. */
const reminder = {
  PENDING: s('warning', 'Pendiente'),
  SENDING: s('info', 'Enviándose'),
  SENT: s('success', 'Enviado'),
  SKIPPED: s('warning', 'Omitido'),
  MISSED: s('neutral', 'No enviado'),
  FAILED: s('danger', 'Falló el envío'),
} satisfies Presentations<Schemas['AppointmentReminderState']>;

// ── Tratamientos ────────────────────────────────────────────────────────────

const treatmentPlan = {
  DRAFT: s('neutral', 'Borrador'),
  // Presentado: espera la respuesta del paciente (DX-040).
  PRESENTED: s('warning', 'Presentado'),
  ACCEPTED: s('info', 'Aceptado'),
  REJECTED: s('danger', 'Rechazado'),
  COMPLETED: s('success', 'Completado'),
  // Cancelado no es un error del paciente (≠ Rechazado).
  CANCELLED: s('neutral', 'Cancelado'),
} satisfies Presentations<Schemas['TreatmentPlanStatus']>;

const treatmentPlanItem = {
  PROPOSED: s('neutral', 'Propuesto'),
  ACCEPTED: s('info', 'Aceptado'),
  DONE: s('success', 'Realizado'),
} satisfies Presentations<Schemas['TreatmentPlanItemStatus']>;

/** Registro del odontograma (y, por extensión, implantes y documentos anulados). */
const toothRecord = {
  PLANNED: s('warning', 'Planificado'),
  COMPLETED: s('success', 'Completado'),
  // Anulado = registro inmutable retirado (no un error): neutro, como en el estado de cuenta.
  VOIDED: s('neutral', 'Anulado'),
} satisfies Presentations<Schemas['ToothTimelineEntryDto']['status'] | 'VOIDED'>;

/** Cualquier registro clínico inmutable retirado (implante, documento): neutro, nunca rojo. */
const clinicalRecord = {
  VOIDED: s('neutral', 'Anulado'),
} satisfies Presentations<'VOIDED'>;

const perioExam = {
  DRAFT: s('neutral', 'Borrador'),
  FINAL: s('success', 'Finalizado'),
} satisfies Presentations<Schemas['PerioExamStatus']>;

const prescription = {
  ISSUED: s('success', 'Emitida'),
  // Anulada = documento inmutable retirado, no un error.
  VOIDED: s('neutral', 'Anulada'),
} satisfies Presentations<Schemas['PrescriptionStatus']>;

// ── Anamnesis y consentimientos ─────────────────────────────────────────────

const anamnesisSubmission = {
  PENDING_PATIENT: s('warning', 'Esperando al paciente'),
  SUBMITTED: s('warning', 'Anamnesis pendiente de revisión'),
  ACCEPTED: s('success', 'Aceptada'),
  REJECTED: s('danger', 'Rechazada'),
  EXPIRED: s('neutral', 'Caducada o anulada'),
} satisfies Presentations<Schemas['MedicalHistorySubmissionStatus']>;

/** Decisión del paciente sobre un ámbito de tratamiento de datos (`granted` true/false/null). */
const dataConsent = {
  GRANTED: s('success', 'Autorizado'),
  DENIED: s('warning', 'No autorizado'),
  UNDECIDED: s('neutral', 'Sin decisión'),
} satisfies Presentations<'GRANTED' | 'DENIED' | 'UNDECIDED'>;

// ── Dinero ──────────────────────────────────────────────────────────────────

const installment = {
  PAID: s('success', 'Pagada'),
  PARTIAL: s('warning', 'Parcial'),
  PENDING: s('warning', 'Pendiente'),
  OVERDUE: s('danger', 'Vencida'),
} satisfies Presentations<Schemas['DerivedInstallmentDto']['status']>;

const expense = {
  PENDING: s('warning', 'Pendiente'),
  PARTIAL: s('warning', 'Parcial'),
  PAID: s('success', 'Pagado'),
  VOIDED: s('neutral', 'Anulado'),
} satisfies Presentations<Exclude<NonNullable<Schemas['ExpenseDto']['status']>, 'OPEN'>>;

const paymentPromise = {
  OPEN: s('warning', 'Abierto'),
  KEPT: s('success', 'Cumplido'),
  BROKEN: s('danger', 'Incumplido'),
} satisfies Presentations<Schemas['PaymentPromiseStatus']>;

/** Turno de caja: la API da OPEN/CLOSED + `reopenCount`; «Reabierta» es un abierto con reaperturas. */
const cashSession = {
  OPEN: s('info', 'Abierta'),
  REOPENED: s('warning', 'Reabierta'),
  CLOSED: s('neutral', 'Cerrada'),
} satisfies Presentations<Schemas['CashSessionStatus'] | 'REOPENED'>;

/**
 * Los métodos de pago NO son estados: son categorías. Todos neutros (sin
 * punto); el icono, si hace falta, distingue. Efectivo en verde y tarjeta en el
 * acento hacían que dos valores categóricos se leyeran como «bien» y «elegido».
 */
const paymentMethod = {
  CASH: s('neutral', 'Efectivo'),
  CARD: s('neutral', 'Tarjeta'),
  TRANSFER: s('neutral', 'Transferencia'),
  OTHER: s('neutral', 'Otro'),
} satisfies Presentations<Schemas['PaymentMethod']>;

// ── Pacientes ───────────────────────────────────────────────────────────────

const coverage = {
  ACTIVE: s('success', 'Vigente'),
  EXPIRED: s('danger', 'Vencida'),
  NOT_STARTED: s('warning', 'Pendiente de inicio'),
} satisfies Presentations<Schemas['PatientCoverageDto']['status']>;

const agreement = {
  ACTIVE: s('success', 'Vigente'),
  EXPIRED: s('danger', 'Vencido'),
  NOT_STARTED: s('warning', 'Pendiente de inicio'),
  INACTIVE: s('neutral', 'Convenio inactivo'),
} satisfies Presentations<Schemas['PatientAgreementStatus']>;

const patientImport = {
  VALIDATED: s('neutral', 'Validado, sin importar'),
  QUEUED: s('info', 'En cola'),
  RUNNING: s('info', 'Importando'),
  COMPLETED: s('success', 'Importado'),
  FAILED: s('danger', 'Con errores'),
  UNDONE: s('neutral', 'Deshecho'),
  EXPIRED: s('neutral', 'Caducado'),
} satisfies Presentations<Schemas['PatientImportStatus']>;

// ── Clínica y administración ────────────────────────────────────────────────

const inventoryStock = {
  LOW: s('warning', 'Bajo stock'),
  OK: s('success', 'OK'),
  UNKNOWN: s('neutral', '—'),
} satisfies Presentations<'LOW' | 'OK' | 'UNKNOWN'>;

/** Directorio del personal: miembro activo, invitación pendiente o inactivo. */
const staff = {
  ACTIVE: s('success', 'Activo'),
  PENDING: s('warning', 'Pendiente'),
  INACTIVE: s('neutral', 'Inactivo'),
} satisfies Presentations<Schemas['StaffDirectoryEntryDto']['status']>;

/**
 * Correo de una invitación (DX-088). «Pendiente» aquí es el despachador
 * trabajando, no algo que el usuario deba hacer: neutro. Solo el fallo pide
 * una acción (reenviar).
 */
const invitationEmail = {
  PENDING: s('neutral', 'Correo: Pendiente'),
  SENT: s('neutral', 'Correo: Enviado'),
  FAILED: s('danger', 'Correo: Falló'),
} satisfies Presentations<Schemas['ReminderEmailDelivery']>;

const tenantDomain = {
  PENDING: s('warning', 'Pendiente'),
  VERIFIED: s('success', 'Verificado'),
  EXPIRED: s('danger', 'Expirado'),
  DISABLED: s('neutral', 'Desactivado'),
} satisfies Presentations<Schemas['TenantDomainState']>;

/**
 * Firma a distancia (DX-243). Enviado y abierto: en curso. Firmado por el
 * paciente: falta la firma del profesional (una acción). Bloqueado: salió mal
 * (anular y reenviar). Caducado y anulado: cerrados sin juicio.
 */
const signatureRequest = {
  SENT: s('info', 'Enviado'),
  OPENED: s('info', 'Abierto'),
  LOCKED: s('danger', 'Bloqueado'),
  EXPIRED: s('neutral', 'Caducado'),
  REVOKED: s('neutral', 'Anulado'),
  SIGNED_BY_PATIENT: s('warning', 'Firmado por paciente'),
  COMPLETE: s('success', 'Completo'),
} satisfies Presentations<Schemas['SignatureRequestStatus']>;

export const STATUS_PRESENTATION = {
  appointment,
  punctuality,
  reminder,
  treatmentPlan,
  treatmentPlanItem,
  toothRecord,
  clinicalRecord,
  perioExam,
  prescription,
  anamnesisSubmission,
  dataConsent,
  installment,
  expense,
  paymentPromise,
  cashSession,
  paymentMethod,
  coverage,
  agreement,
  patientImport,
  inventoryStock,
  staff,
  invitationEmail,
  tenantDomain,
  signatureRequest,
  sedationSheet,
} as const;

export type StatusKind = keyof typeof STATUS_PRESENTATION;
export type StatusOf<K extends StatusKind> = keyof (typeof STATUS_PRESENTATION)[K] & string;

/** Categorías que se pintan como chip neutro sin punto: no son estados. */
export const CATEGORY_KINDS: ReadonlySet<StatusKind> = new Set<StatusKind>(['paymentMethod']);

export function statusPresentation<K extends StatusKind>(kind: K, status: StatusOf<K>): StatusPresentation {
  return (STATUS_PRESENTATION[kind] as Record<string, StatusPresentation>)[status];
}

export function statusTone<K extends StatusKind>(kind: K, status: StatusOf<K>): StatusTone {
  return statusPresentation(kind, status).tone;
}

export function statusLabel<K extends StatusKind>(kind: K, status: StatusOf<K>): string {
  return statusPresentation(kind, status).label;
}

/** `{ ESTADO: etiqueta }` de un tipo: para `<option>`s y textos que citan el estado. */
export function statusLabels<K extends StatusKind>(kind: K): Record<StatusOf<K>, string> {
  const map = STATUS_PRESENTATION[kind] as Record<string, StatusPresentation>;
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v.label])) as Record<StatusOf<K>, string>;
}

/** `{ ESTADO: tono }` de un tipo. */
export function statusTones<K extends StatusKind>(kind: K): Record<StatusOf<K>, StatusTone> {
  const map = STATUS_PRESENTATION[kind] as Record<string, StatusPresentation>;
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v.tone])) as Record<StatusOf<K>, StatusTone>;
}

/**
 * Clases por tono para superficies que no son un chip: bloques de la agenda
 * semanal, puntos del calendario mensual, el chip-select del estado de la cita.
 * Mismos tokens que `Badge` (DESIGN.md → Status tones).
 */
export const TONE_CLASSES: Record<
  StatusTone,
  { readonly subtle: string; readonly text: string; readonly dot: string; readonly border: string }
> = {
  neutral: { subtle: 'bg-surface-active', text: 'text-ink', dot: 'bg-muted', border: 'border-border-input' },
  info: { subtle: 'bg-info-subtle', text: 'text-info-text', dot: 'bg-info', border: 'border-info' },
  success: { subtle: 'bg-success-subtle', text: 'text-success-text', dot: 'bg-success', border: 'border-success' },
  warning: { subtle: 'bg-warning-subtle', text: 'text-warning-text', dot: 'bg-warning', border: 'border-warning' },
  danger: { subtle: 'bg-danger-subtle', text: 'text-danger-text', dot: 'bg-danger', border: 'border-danger' },
};
