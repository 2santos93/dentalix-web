import { formatDate } from '@/lib/format/date';
import type { PatientCoverage } from '@/lib/patients/coverages-api';
import { isExternalPayer } from '@/lib/payers/payer-type';
import type { PayerType } from '@/lib/payers/payers-api';

// SEC-049: nº de afiliado o póliza de una cobertura. Es el espejo de la regla
// de la API (que es la que manda), para avisar en el campo antes de enviar:
// con un pagador externo es obligatorio y la regla es UNA para todos, sin
// supuestos de país ni de tipo de pagador (DX-311): tras normalizar, de 4 a 40
// caracteres (letras, dígitos, espacio, `-`, `.` o `/`), al menos un dígito y
// no un mismo carácter repetido. Ningún mensaje repite el número (es un dato
// personal).

const MIN = 4;
const MAX = 40;

export const memberNumberCopy = {
  required: 'El nº de afiliado o póliza es obligatorio con un pagador externo.',
  format: `El nº de afiliado o póliza debe tener entre ${MIN} y ${MAX} caracteres: letras, números, espacios, guiones, puntos o barras.`,
  noDigit: 'El nº de afiliado o póliza debe tener al menos un número.',
  repeated: 'El nº de afiliado o póliza no puede ser un mismo carácter repetido.',
  hint: 'El número que figura en la tarjeta o póliza del paciente.',
  verified: 'Verificada',
  unverified: 'Sin verificar',
  verifiedBy: (name: string | null, date: string) =>
    name ? `Verificada por ${name} el ${date}` : `Verificada el ${date}`,
};

/** Letras de cualquier alfabeto, dígitos 0-9, espacio y `- . /`. */
const ALLOWED = /^[\p{L}0-9 ./-]+$/u;
const NOT_ALPHANUMERIC = /[^\p{L}0-9]/gu;

/** ¿El tipo de pagador exige nº de afiliado? Los externos; OTHER no. */
export function requiresMemberNumber(type: PayerType): boolean {
  return isExternalPayer(type);
}

/** Mensaje si el número no vale con ese pagador, o `null`. */
export function memberNumberError(type: PayerType, raw: string): string | null {
  if (!requiresMemberNumber(type)) return null;
  const value = raw.trim().replace(/\s+/g, ' ');
  if (value === '') return memberNumberCopy.required;
  const length = [...value].length;
  if (length < MIN || length > MAX || !ALLOWED.test(value)) return memberNumberCopy.format;
  if (!/[0-9]/.test(value)) return memberNumberCopy.noDigit;
  const chars = value.toUpperCase().replace(NOT_ALPHANUMERIC, '');
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
 * externo; `null` con uno interno (OTHER), donde no aplica.
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
