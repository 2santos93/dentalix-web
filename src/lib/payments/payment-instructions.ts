/**
 * DX-569: los datos para pagar de un medio (lo que la clínica mandaba a mano
 * por mensaje), con etiquetas neutras: ningún banco, documento ni moneda de un
 * país. Los usan Ajustes › Caja y la página pública del enlace de pago.
 */
export const PAYMENT_INSTRUCTION_FIELDS = [
  'holderName',
  'holderId',
  'bankName',
  'accountNumber',
  'phone',
  'email',
  'note',
] as const;

export type PaymentInstructionField = (typeof PAYMENT_INSTRUCTION_FIELDS)[number];
export type PaymentInstructionValues = Record<PaymentInstructionField, string | null>;

export const PAYMENT_INSTRUCTION_LABELS: Record<PaymentInstructionField, string> = {
  holderName: 'Titular',
  holderId: 'Identificación del titular',
  bankName: 'Banco o entidad',
  accountNumber: 'Número de cuenta',
  phone: 'Teléfono',
  email: 'Correo',
  note: 'Nota',
};

/** Los topes de la API (D1). */
export const PAYMENT_INSTRUCTION_MAX: Record<PaymentInstructionField, number> = {
  holderName: 80,
  holderId: 30,
  bankName: 80,
  accountNumber: 40,
  phone: 20,
  email: 120,
  note: 280,
};

/** Los datos con algo escrito, en el orden de siempre. */
export function filledInstructionFields(
  values: Partial<PaymentInstructionValues>,
): { field: PaymentInstructionField; value: string }[] {
  return PAYMENT_INSTRUCTION_FIELDS.flatMap((field) => {
    const value = values[field]?.trim();
    return value ? [{ field, value }] : [];
  });
}
