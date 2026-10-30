import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

// DX-377: medios de pago de la clínica; los tipos salen del contrato generado.
export type ClinicPaymentMethod = components['schemas']['PaymentMethodDto'];
export type PaymentMethodKind = ClinicPaymentMethod['kind'];
export type CreatePaymentMethodInput = components['schemas']['CreatePaymentMethodDto'];
export type UpdatePaymentMethodInput = components['schemas']['UpdatePaymentMethodDto'];

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
