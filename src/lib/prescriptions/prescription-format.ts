import { documentFormat, type DocumentFormat } from '@/lib/format/document-format';
import type { PrescriptionLocationFormat } from './prescriptions-api';

export type PrescriptionFormat = DocumentFormat;

/**
 * Formato del A4 (DX-324, spec R11 y §6.3): el de la sede de la receta, con sus
 * valores actuales, tal como los devuelve `GET /prescriptions/:id`. No es la
 * sede activa (`useSedeFormat`). La regla es la de todos los impresos
 * (`documentFormat`, DX-354): `null` si falta algo o el navegador no sabe
 * formatear con ello; nunca otro formato en su lugar.
 */
export function prescriptionFormat(
  loc: PrescriptionLocationFormat | null | undefined,
): PrescriptionFormat | null {
  return documentFormat(loc);
}
