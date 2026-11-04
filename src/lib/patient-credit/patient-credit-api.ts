import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

/*
 * Saldo a favor del paciente (DX-253): traspaso a otro plan vivo del mismo
 * paciente y devolución con comprobante. Los tipos salen del contrato.
 */
export type TransferCreditInput = components['schemas']['TransferCreditDto'];
export type RefundCreditInput = components['schemas']['RefundCreditDto'];
export type CreditTransferResult = components['schemas']['CreditTransferResultDto'];
export type CreditRefund = components['schemas']['CreditRefundDto'];
export type RefundReceiptSnapshot = components['schemas']['RefundReceiptSnapshotDto'];
export type CreditPolicy = components['schemas']['CreditPolicyDto'];
export type CreditTransferMovement = components['schemas']['CreditTransferMovementDto'];
export type PatientCreditMovements = components['schemas']['PatientCreditMovementsDto'];
export type RefundMethod = RefundCreditInput['method'];

/** Formatos de impresión del comprobante: hoja A4 o tirilla de 80 mm. */
export type RefundPrintFormat = 'a4' | '80mm';

/**
 * Quién ve «Aplicar a otro plan» y «Devolver»: ADMIN y recepción (esta, hasta
 * el tope de la clínica: lo decide la API con un 403 en español). DENTIST y
 * ASSISTANT no. Solo decide qué se PINTA; la API vuelve a comprobarlo.
 */
export const PATIENT_CREDIT_ROLES: readonly ClinicRole[] = ['ADMIN', 'RECEPTION'];

export function canMoveCredit(role: ClinicRole | null): boolean {
  return role !== null && PATIENT_CREDIT_ROLES.includes(role);
}

/** `POST /treatment-plans/:id/credit-transfers` con su Idempotency-Key. */
export function transferCredit(
  token: string,
  sourcePlanId: string,
  input: TransferCreditInput,
  idempotencyKey: string,
): Promise<CreditTransferResult> {
  return apiFetch<CreditTransferResult>(
    `/treatment-plans/${encodeURIComponent(sourcePlanId)}/credit-transfers`,
    { method: 'POST', body: input, token, headers: { 'Idempotency-Key': idempotencyKey } },
  );
}

/** `POST /treatment-plans/:id/credit-refunds` con su Idempotency-Key. */
export function refundCredit(
  token: string,
  planId: string,
  input: RefundCreditInput,
  idempotencyKey: string,
): Promise<CreditRefund> {
  return apiFetch<CreditRefund>(
    `/treatment-plans/${encodeURIComponent(planId)}/credit-refunds`,
    { method: 'POST', body: input, token, headers: { 'Idempotency-Key': idempotencyKey } },
  );
}

/** `GET /credit-refunds/:id` — el comprobante (foto inmutable) para imprimir. */
export function getCreditRefund(token: string, refundId: string): Promise<CreditRefund> {
  return apiFetch<CreditRefund>(`/credit-refunds/${encodeURIComponent(refundId)}`, { token });
}

/** Vista imprimible del comprobante (fuera del shell, en otra pestaña). */
export function refundPrintHref(refundId: string, format: RefundPrintFormat = 'a4'): string {
  const base = `/print/credit-refunds/${encodeURIComponent(refundId)}`;
  return format === '80mm' ? `${base}?formato=80mm` : base;
}

/**
 * DX-432: lo que recepción lee cuando el tope de la clínica es 0 (el mismo
 * texto que da la API en su 403). Se pinta como explicación de las acciones
 * deshabilitadas, antes de que nadie choque con el 403.
 */
export const RECEPTION_CAP_ZERO_MESSAGE =
  'Recepción no puede traspasar ni devolver saldo a favor en esta clínica: pídeselo a administración.';

/** Solo administración cambia el tope (la API vuelve a exigirlo). */
export function canManageCreditPolicy(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/** `GET /patients/:id/credit-movements` — traspasos y devoluciones del paciente. */
export function getCreditMovements(token: string, patientId: string): Promise<PatientCreditMovements> {
  return apiFetch<PatientCreditMovements>(`/patients/${encodeURIComponent(patientId)}/credit-movements`, { token });
}

/** `GET /patient-credit/policy` — el tope de recepción (ADMIN y recepción). */
export function getCreditPolicy(token: string): Promise<CreditPolicy> {
  return apiFetch<CreditPolicy>('/patient-credit/policy', { token });
}

/** `PUT /patient-credit/policy` — solo ADMIN; auditado con el antes y el después. */
export function saveCreditPolicy(token: string, receptionMaxAmount: number): Promise<CreditPolicy> {
  return apiFetch<CreditPolicy>('/patient-credit/policy', { method: 'PUT', body: { receptionMaxAmount }, token });
}
