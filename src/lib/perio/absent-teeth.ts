import { getOdontogram, type ToothGroup } from '@/lib/odontogram/odontogram-api';
import { listCatalogItems } from '@/lib/odontogram/catalog-api';
import { ARCH_TEETH } from './perio-grid';

/**
 * DX-403: qué dientes faltan según el odontograma del paciente, para omitirlos
 * por defecto en el periodontograma.
 *
 * La API no tiene un campo «ausente»: el odontograma es la proyección de los
 * registros vigentes por diente (`GET /patients/:id/odontogram`, sin los
 * anulados) y cada registro apunta a un ítem del catálogo (`GET
 * /catalog/items`). Se lee el CÓDIGO del ítem, que es el del catálogo semilla
 * de toda clínica (`default-dental-catalog.ts` en la API):
 *
 * - `DX-AUSENTE` (diagnóstico «Diente ausente») → falta;
 * - una exodoncia o extracción de cordal REALIZADA → falta;
 * - un implante REALIZADO después → vuelve a haber qué sondar.
 *
 * Gana el último de esos registros (llegan en orden de `recordedAt`).
 */
export const ABSENT_DIAGNOSIS_CODES: ReadonlySet<string> = new Set(['DX-AUSENTE']);
export const EXTRACTION_CODES: ReadonlySet<string> = new Set([
  'CX-EXO-SIMPLE',
  'CX-EXO-QUIRURGICA',
  'CX-CORDAL-ERUP',
  'CX-CORDAL-INCL',
]);
export const IMPLANT_CODES: ReadonlySet<string> = new Set(['IMPL-IMPLANTE']);

const PERMANENT_TEETH = new Set([...ARCH_TEETH.upper, ...ARCH_TEETH.lower]);

/** Puro: los ausentes a partir del odontograma y del código de cada ítem del catálogo. */
export function absentTeethFrom(
  groups: readonly ToothGroup[],
  codeById: ReadonlyMap<string, string>,
): Set<number> {
  const absent = new Set<number>();
  for (const group of groups) {
    const fdi = Number(group.toothNumber);
    if (!PERMANENT_TEETH.has(fdi)) continue;
    let missing = false;
    for (const record of group.records) {
      const code = record.catalogItemId ? codeById.get(record.catalogItemId) : undefined;
      if (!code) continue;
      const done = record.status === 'COMPLETED';
      if (record.kind === 'DIAGNOSIS' && ABSENT_DIAGNOSIS_CODES.has(code)) missing = true;
      else if (record.kind === 'PROCEDURE' && done && EXTRACTION_CODES.has(code)) missing = true;
      else if (record.kind === 'PROCEDURE' && done && IMPLANT_CODES.has(code)) missing = false;
    }
    if (missing) absent.add(fdi);
  }
  return absent;
}

/** Lee odontograma y catálogo (también los ítems desactivados) y devuelve los ausentes. */
export async function loadAbsentTeeth(token: string, patientId: string): Promise<Set<number>> {
  const [groups, catalog] = await Promise.all([
    getOdontogram(token, patientId),
    listCatalogItems(token),
  ]);
  return absentTeethFrom(groups, new Map(catalog.map((item) => [item.id, item.code])));
}
