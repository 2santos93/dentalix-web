import type { ClinicRole } from '@/lib/me/me-api';

/**
 * Qué bloque de Inicio ve cada rol (I1). Cada entrada copia el `@Roles(...)`
 * del endpoint que lo alimenta, o lo ACOTA cuando el dato no es trabajo de ese
 * rol (la lista de espera y los aceptados sin agendar los lee cualquiera en la
 * API, pero los agenda el mostrador). Nunca lo amplía: un bloque que la API
 * negaría ni se pide ni se pinta. La frontera sigue en el servidor.
 *
 * DX-503: las listas de «Pendientes» las reparte la API
 * (`GET /work-queues/summary`, `WORK_QUEUE_ROLES`, misma matriz); aquí quedan
 * como documentación y para los bloques que sí pide Inicio (caja, resultados…).
 */
const ACCESS = {
  /** `GET /appointments` (APPOINTMENT_ROLES); el odontólogo, solo las suyas. */
  today: ['ADMIN', 'DENTIST', 'ASSISTANT', 'RECEPTION'],
  /** `GET /closing-queue/count` (CLOSING_QUEUE_ROLES). */
  closingQueue: ['ADMIN', 'DENTIST', 'RECEPTION'],
  /** `GET /medical-history/submissions/summary` (CLINICAL_ROLES). */
  anamnesis: ['ADMIN', 'DENTIST', 'ASSISTANT'],
  /** `GET /treatment-plans/pending-follow-up/count` (TREATMENT_PLAN_FOLLOW_UP_ROLES). */
  followUp: ['ADMIN', 'RECEPTION'],
  /** `GET /treatment-plans/unscheduled/count` (los 4 roles en la API; lo agenda el mostrador). */
  unscheduled: ['ADMIN', 'RECEPTION'],
  /** `GET /waitlist` (APPOINTMENT_ROLES; lo agenda el mostrador). */
  waitlist: ['ADMIN', 'RECEPTION'],
  /** `GET /recall/due/count` (RECALL_LIST_ROLES, DX-015). */
  recall: ['ADMIN', 'RECEPTION'],
  /** `GET /cash-sessions/current` (CASH_SESSION_ROLES). */
  cash: ['ADMIN', 'RECEPTION'],
  /** `GET /receivables/aging/summary` (RECEIVABLES_ROLES). */
  receivables: ['ADMIN', 'RECEPTION'],
  /** `GET /inventory/items?lowStockOnly` (INVENTORY_ROLES). */
  lowStock: ['ADMIN', 'ASSISTANT'],
  /** Lista «Por reponer»: la asistente prepara el material; ADMIN ve el conteo. */
  lowStockList: ['ASSISTANT'],
  /** `GET /dashboard` (DASHBOARD_ROLES) + `GET /reports/locations-comparison` (REPORT_ROLES). */
  periodResults: ['ADMIN'],
  /** Cartera por antigüedad en detalle: la mirada de gestión. Recepción ve la fila de pendientes. */
  aging: ['ADMIN'],
  /** `GET /reports/production-by-procedure` (PRODUCTION_REPORT_ROLES), acotada al propio. */
  myProduction: ['DENTIST'],
} as const satisfies Record<string, readonly ClinicRole[]>;

export type InicioBlock = keyof typeof ACCESS;

export function canSeeBlock(block: InicioBlock, role: ClinicRole | null): boolean {
  return role !== null && (ACCESS[block] as readonly ClinicRole[]).includes(role);
}

/** La línea de apoyo de la cabecera, según lo que ese rol encuentra en Inicio. */
export const INICIO_DESCRIPTION: Record<ClinicRole, string> = {
  ADMIN: 'El día de la clínica: lo de hoy, lo que espera una acción y cómo va el período.',
  RECEPTION: 'Las citas de hoy y lo que el mostrador tiene pendiente: confirmar, cerrar, cobrar y llamar.',
  DENTIST: 'Tus pacientes de hoy con sus alertas, lo que tienes por cerrar y tu producción.',
  ASSISTANT: 'Las citas de hoy, quién está en la clínica y lo que hay que reponer.',
};

export const INICIO_DESCRIPTION_FALLBACK = 'Las citas de hoy y lo que espera una acción.';
