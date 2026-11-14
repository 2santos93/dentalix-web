import type { ClinicRole } from '@/lib/me/me-api';
import type { TreatmentPlanStatus } from './treatment-plans-api';
import { canDecidePlan } from './plan-options';

/**
 * La ÚNICA acción primaria (botón `default`) de la pestaña «Plan de
 * tratamiento» con un plan abierto (DESIGN.md: una primaria por vista; D2).
 * Todas las demás acciones del plan se pintan `secondary`.
 *
 *  - `addItem` — «Agregar ítem» (el formulario al pie del plan).
 *  - `accept` — «Aceptar con firma».
 *  - `scheduleVisit` — «Agendar visita N» de la primera visita con ítems
 *    pendientes sin cita.
 *  - `registerPayment` — «Registrar abono».
 *  - `reprice` — «Actualizar precios» (DX-379 B), cuando el presupuesto venció.
 *  - `null` — ninguna: el plan está cerrado y no queda nada que hacer en él.
 */
export type PlanPrimaryAction = 'addItem' | 'accept' | 'scheduleVisit' | 'registerPayment' | 'reprice';

export interface PlanPrimaryFacts {
  status: TreatmentPlanStatus;
  role: ClinicRole | null;
  /** ¿Ya firmado (presencial o a distancia)? Firmado = ítems congelados. */
  signed: boolean;
  itemCount: number;
  /** ¿Se pinta el formulario «Agregar ítem»? (sin catálogo activo, no). */
  canAddItems: boolean;
  /** ¿Alguna visita tiene ítems pendientes sin cita? (solo en ACCEPTED). */
  hasSchedulableVisit: boolean;
  /** ¿El rol ve el cobro del plan? (ADMIN en esta pestaña). */
  canBill: boolean;
  /** Saldo del plan en su moneda; `null` si no se pidió o no ha llegado. */
  balance: number | null;
  /**
   * DX-379 B: ¿el presupuesto venció (`quoteExpired`, lo decide el servidor) y
   * el rol puede «Actualizar precios» en este plan (`canRepricePlan` +
   * `isPlanRepriceable`)? Sin el dato, `false`.
   */
  expiredRepriceable?: boolean;
}

/**
 * La primaria según el ESTADO del plan, que es lo que dice en qué momento del
 * embudo está (borrador → presentado → aceptado → completado):
 *
 *  - DRAFT: se está armando → «Agregar ítem». Presentar y firmar en la silla
 *    siguen a mano, en secundario.
 *  - PRESENTED: se espera la decisión → «Aceptar con firma» para quien decide
 *    (odontólogo, ADMIN). «Enviar a aceptar» (a distancia) queda secundario:
 *    es la alternativa cuando el paciente no está delante, no el siguiente
 *    paso por defecto. Para la asistente, que no decide, «Agregar ítem».
 *  - ACCEPTED: lo siguiente es clínico → «Agendar visita N» mientras quede
 *    una visita sin cita; si no, cobrar (saldo > 0 y rol de cobro); si no,
 *    firmar el aceptado sin firma.
 *  - COMPLETED: solo queda cobrar lo pendiente.
 *  - REJECTED, CANCELLED: nada (cero primarias es mejor que una inventada).
 *
 * Un borrador o presentado VENCIDO que el rol puede recotizar → «Actualizar
 * precios»: firmarlo da 409 y la vía para renovarlo es esa (DX-379 B).
 *
 * Si la primaria del estado no está al alcance del rol, se cae a la
 * siguiente que sí lo esté; nunca dos.
 */
export function planPrimaryAction(facts: PlanPrimaryFacts): PlanPrimaryAction | null {
  const mayAccept = canDecidePlan(facts.role) && !facts.signed && facts.itemCount > 0;
  const mayAddItems = facts.canAddItems && !facts.signed;
  const owes = facts.canBill && facts.balance !== null && facts.balance > 0;

  if (facts.expiredRepriceable && (facts.status === 'DRAFT' || facts.status === 'PRESENTED')) return 'reprice';
  switch (facts.status) {
    case 'DRAFT':
      return mayAddItems ? 'addItem' : null;
    case 'PRESENTED':
      if (mayAccept) return 'accept';
      return mayAddItems ? 'addItem' : null;
    case 'ACCEPTED':
      if (facts.hasSchedulableVisit) return 'scheduleVisit';
      if (owes) return 'registerPayment';
      return mayAccept ? 'accept' : null;
    case 'COMPLETED':
      return owes ? 'registerPayment' : null;
    default:
      return null;
  }
}
