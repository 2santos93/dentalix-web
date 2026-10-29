// Excepción G5.3 (DX-334): tipos de documento anteriores a DX-327.
import type { DocType } from './patients-api';

/**
 * DX-327 (fase 1, spec R3 y §6.2): solo para que la web no pinte «undefined»
 * si una réplica anterior de la API le responde con un código antiguo. Solo
 * códigos: ningún código da etiqueta ni nombre; el nombre visible sale siempre
 * de `documentTypeName` (R17).
 */
const DOC_TYPE_BY_CODE: Readonly<Record<string, DocType>> = {
  CC: 'NATIONAL_ID',
  TI: 'NATIONAL_ID',
  CE: 'RESIDENCE_PERMIT',
  NATIONAL_ID: 'NATIONAL_ID',
  PASSPORT: 'PASSPORT',
  RESIDENCE_PERMIT: 'RESIDENCE_PERMIT',
  TAX_ID: 'TAX_ID',
  OTHER: 'OTHER',
};

/** Código antiguo → su genérico; genérico → sí mismo; desconocido → null. */
export function normalizeDocType(code: string): DocType | null {
  return Object.hasOwn(DOC_TYPE_BY_CODE, code) ? DOC_TYPE_BY_CODE[code] : null;
}
