import type { Icd10Code } from '@/lib/reference/icd10-api';
import type { ClinicalEntryDiagnosisInput } from '@/lib/patients/clinical-api';
import { isFdiToothNumber } from '@/lib/odontogram/fdi';

/** Un diagnóstico del formulario: código elegido (o nada) y diente FDI. */
export interface DiagnosisRowDraft {
  code: Icd10Code | null;
  tooth: string;
}

export interface RelatedDiagnosisDraft extends DiagnosisRowDraft {
  /** Clave estable de la fila (para `key` y para quitarla). */
  key: number;
}

/** Diagnósticos de «Nueva evolución» (DX-212): 1 principal y ≤ 3 relacionados. */
export interface DiagnosesDraft {
  principal: DiagnosisRowDraft;
  related: RelatedDiagnosisDraft[];
}

export function emptyDiagnosesDraft(): DiagnosesDraft {
  return { principal: { code: null, tooth: '' }, related: [] };
}

export type DiagnosesPayload =
  | { diagnoses: ClinicalEntryDiagnosisInput[] }
  | { error: string };

/**
 * Lo que se envía a la API. Las reglas de fondo (código existente, un solo
 * principal, tope de relacionados) las vuelve a aplicar el servidor; aquí solo
 * se evita mandar algo que seguro rechaza.
 */
export function diagnosesPayload(draft: DiagnosesDraft): DiagnosesPayload {
  const rows: { row: DiagnosisRowDraft; kind: 'PRINCIPAL' | 'RELACIONADO' }[] = [
    { row: draft.principal, kind: 'PRINCIPAL' },
    ...draft.related.map((row) => ({ row, kind: 'RELACIONADO' as const })),
  ];
  const diagnoses: ClinicalEntryDiagnosisInput[] = [];
  for (const { row, kind } of rows) {
    const tooth = row.tooth.trim();
    if (!row.code) {
      if (tooth) return { error: `Elige el diagnóstico del diente ${tooth}.` };
      continue;
    }
    if (tooth && !isFdiToothNumber(tooth)) {
      return { error: `El diente «${tooth}» no es un número FDI válido.` };
    }
    if (kind === 'RELACIONADO' && !draft.principal.code) {
      return { error: 'Elige primero el diagnóstico principal.' };
    }
    diagnoses.push({ icd10Code: row.code.code, kind, ...(tooth ? { toothFdi: tooth } : {}) });
  }
  return { diagnoses };
}
