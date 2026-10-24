import { formatDate } from '@/lib/format/date';
import type { PatientCoverage } from '@/lib/patients/coverages-api';
import type { PayerType } from '@/lib/payers/payers-api';

// SEC-049: nº de afiliado o póliza de una cobertura. Es el espejo de la regla
// de la API (que es la que manda), para avisar en el campo antes de enviar:
// con un pagador externo es obligatorio y tiene un formato básico por tipo.
// Ningún mensaje repite el número (es un dato personal).

export const memberNumberCopy = {
  required: {
    EPS_CO: 'En una EPS, el nº de afiliado es obligatorio: es el documento del afiliado.',
    PREPAGADA_CO: 'En una prepagada, el nº de contrato o de afiliado es obligatorio.',
    MUTUA_ES: 'En una mutua o aseguradora, el nº de póliza o de tarjeta es obligatorio.',
    EMPRESA: 'En un convenio de empresa, el nº de empleado o de afiliado es obligatorio.',
  } satisfies Record<Exclude<PayerType, 'OTRO'>, string>,
  epsFormat:
    'En una EPS, el nº de afiliado es el documento del afiliado: de 5 a 15 dígitos, sin letras.',
  policyFormat:
    'El nº de póliza o de contrato debe tener de 5 a 30 caracteres (letras, números, espacios, puntos, guiones o barras), con al menos 4 dígitos.',
  employeeFormat:
    'El nº de empleado o de afiliado debe tener de 5 a 30 caracteres (letras, números, espacios, puntos, guiones o barras), con al menos un dígito.',
  repeated: 'El nº de afiliado no puede ser un mismo carácter repetido.',
  hint: {
    EPS_CO: 'El documento del afiliado, de 5 a 15 dígitos.',
    PREPAGADA_CO: 'El nº de contrato o de afiliado del carné.',
    MUTUA_ES: 'El nº de póliza o de la tarjeta sanitaria.',
    EMPRESA: 'El nº de empleado o de afiliado que da la empresa.',
  } satisfies Record<Exclude<PayerType, 'OTRO'>, string>,
  verified: 'Verificada',
  unverified: 'Sin verificar',
  verifiedBy: (name: string | null, date: string) =>
    name ? `Verificada por ${name} el ${date}` : `Verificada el ${date}`,
};

const SHAPE = /^[A-Za-z0-9](?:[A-Za-z0-9 ./-]*[A-Za-z0-9])?$/;
const EPS_SHAPE = /^\d(?:[\d .-]*\d)?$/;

/** ¿El tipo de pagador exige nº de afiliado? Los externos; OTRO no. */
export function requiresMemberNumber(type: PayerType): type is Exclude<PayerType, 'OTRO'> {
  return type !== 'OTRO';
}

/** Mensaje si el número no vale para ese tipo de pagador, o `null`. */
export function memberNumberError(type: PayerType, raw: string): string | null {
  if (!requiresMemberNumber(type)) return null;
  const value = raw.trim().replace(/\s+/g, ' ');
  if (value === '') return memberNumberCopy.required[type];
  const digits = value.replace(/\D/g, '').length;
  if (type === 'EPS_CO') {
    if (!EPS_SHAPE.test(value) || digits < 5 || digits > 15) return memberNumberCopy.epsFormat;
  } else if (
    !SHAPE.test(value) ||
    value.length < 5 ||
    value.length > 30 ||
    digits < (type === 'EMPRESA' ? 1 : 4)
  ) {
    return type === 'EMPRESA' ? memberNumberCopy.employeeFormat : memberNumberCopy.policyFormat;
  }
  const chars = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return new Set(chars).size === 1 ? memberNumberCopy.repeated : null;
}

export interface CoverageVerificationBadge {
  label: string;
  variant: 'success' | 'muted';
  /** «Verificada por … el …», o `null` sin verificar. */
  detail: string | null;
}

/**
 * Insignia «Verificada» / «Sin verificar» de una cobertura de un pagador
 * externo; `null` con uno interno (OTRO), donde no aplica.
 */
export function coverageVerificationBadge(
  c: Pick<PatientCoverage, 'verifiedAt' | 'verifiedByName'> & {
    payer: Pick<PatientCoverage['payer'], 'type'>;
  },
): CoverageVerificationBadge | null {
  if (!requiresMemberNumber(c.payer.type)) return null;
  if (!c.verifiedAt) {
    return { label: memberNumberCopy.unverified, variant: 'muted', detail: null };
  }
  return {
    label: memberNumberCopy.verified,
    variant: 'success',
    detail: memberNumberCopy.verifiedBy(c.verifiedByName, formatDate(c.verifiedAt)),
  };
}
