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
