/**
 * Excepción G5.3 (DX-334): recetas emitidas antes de DX-324.
 *
 * Único fichero de la web que nombra los países de la receta (spec R12). Una
 * receta anterior a la receta única guarda el país con el que se emitió y se
 * imprime con sus textos de entonces, byte a byte: los de
 * `prescription-document.tsx` antes de DX-324. No se editan. `validityNote` va
 * sin paréntesis; el documento los añade (pre-flight M6).
 */
import type { components } from '@/lib/api/schema';
import type { Prescription } from './prescriptions-api';
import type { PrescriptionLayout } from './prescription-layout';

type LegacyPrescriptionCountry = components['schemas']['LegacyPrescriptionCountry'];

const LEGACY_LAYOUTS: Record<LegacyPrescriptionCountry, PrescriptionLayout> = {
  CO: {
    title: 'Fórmula médica',
    subtitle: 'Decreto 780 de 2016, art. 2.5.3.10.16',
    dispensationLabel: 'Fecha de la receta',
    validityNote: '30 días naturales',
    documentLabel: 'Documento',
    licenseLabel: 'Registro profesional',
    patientRows: 'clinicalRecord',
  },
  ES: {
    title: 'Receta médica privada',
    subtitle: 'Real Decreto 1718/2010, art. 3',
    dispensationLabel: 'Fecha prevista de dispensación',
    validityNote: '10 días naturales',
    documentLabel: 'DNI/NIE',
    licenseLabel: 'Nº de colegiado',
    patientRows: 'birthYear',
  },
};

/** La plantilla congelada de una receta anterior, o `null` si es una receta única. */
export function legacyPrescriptionLayout(rx: Pick<Prescription, 'country'>): PrescriptionLayout | null {
  return rx.country === null ? null : LEGACY_LAYOUTS[rx.country];
}
