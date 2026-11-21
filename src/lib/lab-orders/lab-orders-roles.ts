import type { ClinicRole } from '@/lib/me/me-api';

// DX-017: quién lee y escribe el laboratorio dental (los conjuntos de
// clinic-role-sets.ts de la API). El menú y los botones solo evitan ofrecer lo
// que acabaría en 403: la frontera la pone la API.

/** Leer el catálogo de laboratorios (LAB_CATALOG_READ_ROLES: los cuatro). */
export function canReadDentalLabs(role: ClinicRole | null): boolean {
  return role !== null;
}

/** Crear y cambiar laboratorios y servicios (LAB_CATALOG_WRITE_ROLES): solo ADMIN. */
export function canManageDentalLabs(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/** Ver las órdenes de laboratorio (LAB_ORDER_READ_ROLES: los cuatro). */
export function canReadLabOrders(role: ClinicRole | null): boolean {
  return role !== null;
}

/** Crear, cambiar el contenido y anular (LAB_ORDER_WRITE_ROLES): ADMIN y DENTIST. */
export function canWriteLabOrders(role: ClinicRole | null): boolean {
  return role === 'ADMIN' || role === 'DENTIST';
}

/** Enviar y recibir (LAB_ORDER_SEND_ROLES = RECEIVE): ADMIN, DENTIST y RECEPTION. */
export function canSendLabOrders(role: ClinicRole | null): boolean {
  return role === 'ADMIN' || role === 'DENTIST' || role === 'RECEPTION';
}

/** Marcar «Revisada» (LAB_ORDER_CHECK_ROLES): ADMIN y DENTIST. */
export function canCheckLabOrders(role: ClinicRole | null): boolean {
  return role === 'ADMIN' || role === 'DENTIST';
}

/** DX-018-bis: el costo del laboratorio de una orden (LAB_ORDER_COST_ROLES): solo ADMIN. */
export function canSetLabOrderCost(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/** La prescripción imprimible (`GET /lab-orders/:id/print`): CLINICAL_ROLES. */
export function canPrintLabOrders(role: ClinicRole | null): boolean {
  return role === 'ADMIN' || role === 'DENTIST' || role === 'ASSISTANT';
}

/** «Trabajos de laboratorio» de la sede. */
export const LAB_ORDERS_HREF = '/laboratorio';

/** Ajustes › Laboratorios dentales. */
export const DENTAL_LABS_SETTINGS_HREF = '/settings/laboratorios';

/** La prescripción A4 de una orden. */
export function labOrderPrintHref(orderId: string): string {
  return `/print/lab-orders/${encodeURIComponent(orderId)}`;
}

/** Ficha del paciente en la sección «Laboratorio»; con ítem, abre «Nueva orden» desde él. */
export function labOrdersTabHref(patientId: string, planItemId?: string): string {
  const base = `/patients/${encodeURIComponent(patientId)}?tab=lab-orders`;
  return planItemId ? `${base}&labOrderPlanItem=${encodeURIComponent(planItemId)}` : base;
}
