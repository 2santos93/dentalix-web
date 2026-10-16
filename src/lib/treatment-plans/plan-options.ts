import type { ClinicRole } from '@/lib/me/me-api';
import { formatDate } from '@/lib/format/date';
import { whatsAppUrl } from '@/lib/appointments/confirmation-message';
import type { components } from '@/lib/api/schema';
import type { TreatmentPlan, TreatmentPlanStatus } from './treatment-plans-api';

export type RejectionReason = components['schemas']['RejectTreatmentPlanDto']['reason'];

/**
 * Alternativas, presentación y rechazo del plan (DX-040). Estas funciones solo
 * deciden qué se PINTA; la API vuelve a comprobar rol y transición (403/409).
 */

/** Presentar y aceptar: odontólogo y ADMIN (`TREATMENT_PLAN_DECISION_ROLES`). */
const DECISION_ROLES: readonly ClinicRole[] = ['DENTIST', 'ADMIN'];
/** Rechazar: además recepción, que llama al paciente (`TREATMENT_PLAN_REJECT_ROLES`). */
const REJECT_ROLES: readonly ClinicRole[] = ['DENTIST', 'RECEPTION', 'ADMIN'];
/** «Presupuestos por seguir»: ADMIN y recepción (`TREATMENT_PLAN_FOLLOW_UP_ROLES`). */
const FOLLOW_UP_ROLES: readonly ClinicRole[] = ['ADMIN', 'RECEPTION'];

export function canDecidePlan(role: ClinicRole | null): boolean {
  return role !== null && DECISION_ROLES.includes(role);
}

export function canRejectPlan(role: ClinicRole | null): boolean {
  return role !== null && REJECT_ROLES.includes(role);
}

export function canSeeFollowUp(role: ClinicRole | null): boolean {
  return role !== null && FOLLOW_UP_ROLES.includes(role);
}

/**
 * Espejo de la máquina de estados de la API (`plan-status-machine.ts`), solo
 * con las transiciones que hace el PATCH: presentar y rechazar tienen botón
 * propio.
 */
const PATCH_TRANSITIONS: Record<TreatmentPlanStatus, readonly TreatmentPlanStatus[]> = {
  DRAFT: ['ACCEPTED', 'CANCELLED'],
  PRESENTED: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['COMPLETED', 'CANCELLED'],
  REJECTED: ['CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

/** Opciones del selector de estado: el actual y a dónde puede pasar este rol. */
export function patchableStatuses(
  current: TreatmentPlanStatus,
  role: ClinicRole | null,
): TreatmentPlanStatus[] {
  const next = PATCH_TRANSITIONS[current].filter(
    (status) => status !== 'ACCEPTED' || canDecidePlan(role),
  );
  return [current, ...next];
}

/** «Presentar»: un borrador con procedimientos, por quien decide el plan. */
export function canPresentPlan(
  plan: { status: TreatmentPlanStatus; items?: readonly unknown[] },
  role: ClinicRole | null,
): boolean {
  return canDecidePlan(role) && plan.status === 'DRAFT' && (plan.items?.length ?? 0) > 0;
}

/** «Rechazar»: un plan presentado. */
export function canRejectThisPlan(
  plan: { status: TreatmentPlanStatus },
  role: ClinicRole | null,
): boolean {
  return canRejectPlan(role) && plan.status === 'PRESENTED';
}

const CLOSED: readonly TreatmentPlanStatus[] = ['ACCEPTED', 'COMPLETED'];

/** Un grupo cuya opción ya se eligió no admite más alternativas (la API: 409). */
export function canCreateAlternative(
  plan: { status: TreatmentPlanStatus },
  group: readonly { status: TreatmentPlanStatus }[],
): boolean {
  return ![plan, ...group].some((member) => CLOSED.includes(member.status));
}

/** Las opciones del grupo de `plan` (él incluido), por etiqueta; [] si es suelto. */
export function optionGroupOf(plans: readonly TreatmentPlan[], plan: TreatmentPlan): TreatmentPlan[] {
  if (!plan.optionGroupId) return [];
  return plans
    .filter((p) => p.optionGroupId === plan.optionGroupId)
    .sort(
      (a, b) =>
        (a.optionLabel ?? '').localeCompare(b.optionLabel ?? '', 'es') ||
        a.createdAt.localeCompare(b.createdAt),
    );
}

export const REJECTION_REASON_LABELS: Record<RejectionReason, string> = {
  PRICE: 'Precio',
  FEAR: 'Miedo al tratamiento',
  SECOND_OPINION: 'Quiere una segunda opinión',
  OTHER_OPTION_ACCEPTED: 'Aceptó otra opción',
  OTHER: 'Otro',
};

/** Los que elige el personal; «Aceptó otra opción» lo pone el sistema. */
export const SELECTABLE_REJECTION_REASONS: readonly RejectionReason[] = [
  'PRICE',
  'FEAR',
  'SECOND_OPINION',
  'OTHER',
];

/**
 * Mensaje prellenado para escribirle al paciente por WhatsApp. Sin el
 * procedimiento ni el monto: un chat no es un canal seguro para datos
 * clínicos (mismo criterio que la confirmación de citas).
 */
export function followUpMessage({
  patientName,
  clinicName,
  presentedAt,
}: {
  patientName: string;
  clinicName: string | null;
  presentedAt: string;
}): string {
  const firstName = patientName.trim().split(/\s+/)[0];
  const greeting = firstName ? `Hola ${firstName}` : 'Hola';
  const clinic = clinicName ? clinicName : 'la clínica';
  return (
    `${greeting}, te escribimos de ${clinic} por el presupuesto que te presentamos el ` +
    `${formatDate(presentedAt)}. ¿Te quedó alguna duda o quieres agendar para empezar?`
  );
}

/** `https://wa.me/…` con el mensaje, o `null` si el teléfono no sirve para WhatsApp. */
export function followUpWhatsAppHref(
  item: { patientName: string; patientWhatsApp: string | null; presentedAt: string },
  clinicName: string | null,
): string | null {
  if (!item.patientWhatsApp) return null;
  return whatsAppUrl(item.patientWhatsApp, followUpMessage({ ...item, clinicName }));
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Cómo llamará la API a la alternativa nueva si no se escribe nombre: la letra
 * siguiente del grupo (un plan suelto pasa a «Opción A», la nueva es la «B»).
 */
export function nextOptionLabel(groupSize: number): string {
  const index = Math.max(groupSize, 1);
  return index < LETTERS.length ? `Opción ${LETTERS[index]}` : `Opción ${index + 1}`;
}
