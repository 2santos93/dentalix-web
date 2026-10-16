import type { PublishPrivacyPolicyInput } from './data-consents-api';

/**
 * Borrador con el que arranca la primera publicación: la clínica lo adapta
 * (nombre, canal de atención) antes de publicar. El texto de datos sensibles ya
 * trae las tres frases que exige el Dec. 1377 de 2013 (art. 6).
 */
export const POLICY_TEMPLATE: PublishPrivacyPolicyInput = {
  policyText: [
    '[Nombre de la clínica], como responsable del tratamiento, recoge y trata los datos personales de sus pacientes conforme a la Ley 1581 de 2012 y el Decreto 1377 de 2013.',
    'Finalidades: prestar la atención odontológica, llevar la historia clínica, agendar y recordar citas, facturar y cumplir obligaciones legales.',
    'Derechos del titular: conocer, actualizar, rectificar y suprimir sus datos, revocar la autorización y presentar quejas ante la Superintendencia de Industria y Comercio.',
    'Canal de atención: [correo o teléfono de contacto].',
  ].join('\n\n'),
  generalText:
    'Autorizo el tratamiento de mis datos personales de identificación y contacto para las finalidades descritas en la política.',
  sensitiveHealthText:
    'Autorizo de forma expresa el tratamiento de mis datos sensibles de salud (historia clínica, odontograma, radiografías y antecedentes médicos). Se me informó que no estoy obligado a autorizar el tratamiento de datos sensibles. Finalidad: prestar la atención odontológica y conservar la historia clínica según la ley.',
  marketingText:
    'Autorizo recibir comunicaciones comerciales (promociones, campañas y recordatorios no clínicos) por teléfono, WhatsApp o correo. Puedo revocarlo en cualquier momento.',
};

export type SensitiveHealthElement = 'NOT_OBLIGED' | 'SENSITIVE_DATA' | 'PURPOSE';

/**
 * Guía en vivo para quien redacta: MISMO criterio que la API
 * (`missingSensitiveHealthElements` en dentalix-api), que es quien decide; aquí
 * solo se adelanta el aviso.
 */
const REQUIRED: { element: SensitiveHealthElement; label: string; pattern: RegExp }[] = [
  {
    element: 'NOT_OBLIGED',
    label: 'Que el paciente «no está obligado» a autorizar',
    pattern: /\bno\s+(esta|estoy|estas)\s+obligad[oa]s?\b|\bno\s+es\s+obligatori[oa]\b/,
  },
  {
    element: 'SENSITIVE_DATA',
    label: 'Qué «datos sensibles» se tratan',
    pattern: /\bdatos\s+sensibles\b/,
  },
  {
    element: 'PURPOSE',
    label: 'La «finalidad» del tratamiento',
    pattern: /\bfinalidad(es)?\b/,
  },
];

export interface ElementCheck {
  element: SensitiveHealthElement;
  label: string;
  present: boolean;
}

export function checkSensitiveHealthText(text: string): ElementCheck[] {
  const folded = text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  return REQUIRED.map(({ element, label, pattern }) => ({
    element,
    label,
    present: pattern.test(folded),
  }));
}
