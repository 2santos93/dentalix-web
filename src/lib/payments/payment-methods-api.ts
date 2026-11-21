import { apiFetch, apiFetchOrNull } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

// DX-377: medios de pago de la clínica; los tipos salen del contrato generado.
export type ClinicPaymentMethod = components['schemas']['PaymentMethodDto'];
export type PaymentMethodKind = ClinicPaymentMethod['kind'];
export type CreatePaymentMethodInput = components['schemas']['CreatePaymentMethodDto'];
export type UpdatePaymentMethodInput = components['schemas']['UpdatePaymentMethodDto'];

/** DX-389: «Pide comprobante» del medio: no lo admite, lo admite o lo exige. */
export type PaymentProofPolicy = ClinicPaymentMethod['proofPolicy'];

export const PAYMENT_PROOF_POLICY_OPTIONS: PaymentProofPolicy[] = ['NONE', 'OPTIONAL', 'REQUIRED'];

export const PAYMENT_PROOF_POLICY_LABELS: Record<PaymentProofPolicy, string> = {
  NONE: 'No',
  OPTIONAL: 'Opcional',
  REQUIRED: 'Obligatorio',
};

/** Código estable del 409 de referencia repetida al registrar un abono. */
export const PAYMENT_REFERENCE_DUPLICATE = 'PAYMENT_REFERENCE_DUPLICATE';

export const PAYMENT_METHOD_KIND_OPTIONS: PaymentMethodKind[] = [
  'CASH',
  'CARD',
  'TRANSFER',
  'DIGITAL',
  'OTHER',
];

export const PAYMENT_METHOD_KIND_LABELS: Record<PaymentMethodKind, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
  DIGITAL: 'Digital',
  OTHER: 'Otro',
};

/** Crear y editar medios: solo ADMIN (como la API). */
export function canManagePaymentMethods(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/**
 * `GET /payment-methods`: por defecto solo los activos (el selector del modal
 * de abono); `includeInactive` para Ajustes › Caja.
 */
export async function listPaymentMethods(
  token: string,
  params: { includeInactive?: boolean } = {},
): Promise<ClinicPaymentMethod[]> {
  const query = params.includeInactive ? '?includeInactive=true' : '';
  return apiFetch<ClinicPaymentMethod[]>(`/payment-methods${query}`, { token });
}

export async function createPaymentMethod(
  token: string,
  input: CreatePaymentMethodInput,
): Promise<ClinicPaymentMethod> {
  return apiFetch<ClinicPaymentMethod>('/payment-methods', {
    method: 'POST',
    body: input,
    token,
  });
}

/**
 * DX-018-bis: `PUT /payment-methods/:id/gateway-fee` (solo ADMIN): el % que la
 * pasarela cobra a la clínica por cada cobro con el medio; null lo quita.
 */
export async function setPaymentMethodGatewayFee(
  token: string,
  id: string,
  percent: number | null,
): Promise<ClinicPaymentMethod> {
  return apiFetch<ClinicPaymentMethod>(`/payment-methods/${id}/gateway-fee`, {
    method: 'PUT',
    body: { percent },
    token,
  });
}

/** DX-018-bis: rango de la comisión de la pasarela (0 < p ≤ 100, 2 decimales). */
export const GATEWAY_FEE_MAX = 100;

export async function updatePaymentMethod(
  token: string,
  id: string,
  input: UpdatePaymentMethodInput,
): Promise<ClinicPaymentMethod> {
  return apiFetch<ClinicPaymentMethod>(`/payment-methods/${id}`, {
    method: 'PATCH',
    body: input,
    token,
  });
}

// DX-516: ajustes por medio de pago (solo ADMIN).
export type PaymentMethodAdjustment = components['schemas']['PaymentMethodAdjustmentDto'];
export type CreatePaymentAdjustmentInput = components['schemas']['CreatePaymentAdjustmentDto'];
export type UpdatePaymentAdjustmentInput = components['schemas']['UpdatePaymentAdjustmentDto'];

export async function createPaymentAdjustment(
  token: string,
  paymentMethodId: string,
  input: CreatePaymentAdjustmentInput,
): Promise<PaymentMethodAdjustment> {
  return apiFetch<PaymentMethodAdjustment>(`/payment-methods/${paymentMethodId}/adjustments`, {
    method: 'POST',
    body: input,
    token,
  });
}

export async function updatePaymentAdjustment(
  token: string,
  paymentMethodId: string,
  adjustmentId: string,
  input: UpdatePaymentAdjustmentInput,
): Promise<PaymentMethodAdjustment> {
  return apiFetch<PaymentMethodAdjustment>(`/payment-methods/${paymentMethodId}/adjustments/${adjustmentId}`, {
    method: 'PATCH',
    body: input,
    token,
  });
}

// DX-569: «Permitir en el enlace de pago» y los datos para pagar de cada medio.
// Ver lo que hay lo puede quien cobra (PAYMENT_ROLES); escribir, solo ADMIN.
export type PaymentMethodInstruction = components['schemas']['PaymentMethodInstructionDto'];
export type SavePaymentMethodInstructionInput = components['schemas']['SavePaymentMethodInstructionsDto'];

/** Ver los medios y sus datos para pagar: los roles que cobran (PAYMENT_ROLES). */
export function canReadPaymentMethods(role: ClinicRole | null): boolean {
  return role === 'ADMIN' || role === 'RECEPTION';
}

/** `GET /payment-methods/:id/instructions`: los de toda la clínica y los de cada sede. */
export function listPaymentMethodInstructions(
  token: string,
  paymentMethodId: string,
): Promise<PaymentMethodInstruction[]> {
  return apiFetch<PaymentMethodInstruction[]>(`/payment-methods/${paymentMethodId}/instructions`, { token });
}

/** `PUT /payment-methods/:id/instructions`: sustituye los datos de ese ámbito (clínica o sede). */
export function savePaymentMethodInstructions(
  token: string,
  paymentMethodId: string,
  input: SavePaymentMethodInstructionInput,
): Promise<PaymentMethodInstruction> {
  return apiFetch<PaymentMethodInstruction>(`/payment-methods/${paymentMethodId}/instructions`, {
    method: 'PUT',
    body: input,
    token,
  });
}

export async function deletePaymentMethodInstructions(
  token: string,
  paymentMethodId: string,
  instructionId: string,
): Promise<void> {
  // 204 sin cuerpo.
  await apiFetchOrNull<null>(`/payment-methods/${paymentMethodId}/instructions/${instructionId}`, {
    method: 'DELETE',
    token,
  });
}
