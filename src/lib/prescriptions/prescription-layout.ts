import type { Prescription } from './prescriptions-api';

/**
 * Textos de la receta impresa (DX-324, spec §6.2). Una receta única pinta la
 * plantilla neutral; las emitidas antes de DX-324, la suya congelada
 * (`legacy-prescription-layout.ts`). `validityNote` va sin paréntesis: el
 * documento los añade.
 */
export interface PrescriptionLayout {
  title: string;
  subtitle: string | null;
  dispensationLabel: string;
  validityNote: string;
  documentLabel: string;
  licenseLabel: string;
  patientRows: 'clinicalRecord' | 'birthYear' | 'neutral';
}

const copy = {
  title: 'Receta',
  dispensation: 'Válida desde',
  validity: (days: number) => (days === 1 ? '1 día' : `${days} días`),
  document: 'Documento',
  license: 'Nº de registro profesional',
};

const DAY_MS = 86_400_000;

function civilDayNumber(day: string): number {
  const [year, month, date] = day.split('-').map(Number);
  return Date.UTC(year, month - 1, date) / DAY_MS;
}

/**
 * Días civiles de validez, contando el de inicio y el último:
 * `validUntil = dispensationDate + días − 1` (spec R6). Sin zona: son días
 * civiles 'YYYY-MM-DD'.
 */
export function validityDaysOf(dispensationDate: string, validUntil: string): number {
  return civilDayNumber(validUntil) - civilDayNumber(dispensationDate) + 1;
}

/** Plantilla de la receta única: la validez sale de sus dos fechas, no de un ajuste vigente (R9). */
export function neutralPrescriptionLayout(
  rx: Pick<Prescription, 'dispensationDate' | 'validUntil'>,
): PrescriptionLayout {
  return {
    title: copy.title,
    subtitle: null,
    dispensationLabel: copy.dispensation,
    validityNote: copy.validity(validityDaysOf(rx.dispensationDate, rx.validUntil)),
    documentLabel: copy.document,
    licenseLabel: copy.license,
    patientRows: 'neutral',
  };
}
