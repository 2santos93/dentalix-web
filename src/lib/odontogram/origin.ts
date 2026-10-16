import type { ToothRecord, ToothRecordOrigin } from './odontogram-api';

/**
 * Origen de un registro del odontograma (DX-120). Lo hecho en la clínica se
 * pinta con el color del catálogo; lo que el paciente ya traía y lo que hizo
 * otro profesional llevan además un rayado propio, explicado en la leyenda.
 */
export const ORIGIN_LABELS: Record<ToothRecordOrigin, string> = {
  THIS_CLINIC: 'Hecho en la clínica',
  PRE_EXISTING: 'Ya presente',
  OTHER_PROVIDER: 'Otro profesional',
};

/** En minúscula, para encadenarlo en el nombre accesible del diente. */
export const ORIGIN_SHORT_LABELS: Record<ToothRecordOrigin, string> = {
  THIS_CLINIC: 'hecho en la clínica',
  PRE_EXISTING: 'ya presente',
  OTHER_PROVIDER: 'otro profesional',
};

export const ORIGIN_ORDER: ToothRecordOrigin[] = ['THIS_CLINIC', 'PRE_EXISTING', 'OTHER_PROVIDER'];

/** Id del `<pattern>` SVG de cada origen externo (los define `OriginPatterns`). */
export const ORIGIN_PATTERN_ID: Record<Exclude<ToothRecordOrigin, 'THIS_CLINIC'>, string> = {
  PRE_EXISTING: 'odo-origin-pre-existing',
  OTHER_PROVIDER: 'odo-origin-other-provider',
};

/** Los registros anteriores a DX-120 no traen origen: son de la clínica. */
export function recordOrigin(record: Pick<ToothRecord, 'origin'>): ToothRecordOrigin {
  return record.origin ?? 'THIS_CLINIC';
}
