import type { PublishPrivacyPolicyInput } from './data-consents-api';

/** Marcadores de la plantilla que la clínica debe sustituir antes de publicar. */
export const POLICY_TEMPLATE_PLACEHOLDERS = [
  '[Nombre de la clínica]',
  '[Dirección]',
  '[Correo o teléfono de contacto]',
] as const;

/**
 * Borrador neutro de la primera publicación: la clínica sustituye los textos
 * entre corchetes y lo adapta a su marco legal. Dentalix no valida su contenido.
 */
export const POLICY_TEMPLATE: PublishPrivacyPolicyInput = {
  policyText: [
    'Responsable del tratamiento: [Nombre de la clínica], con domicilio en [Dirección], recoge y trata los datos personales de sus pacientes.',
    'Finalidades: prestar la atención odontológica, llevar la historia clínica, agendar y recordar citas, cobrar y facturar los servicios, y cumplir las obligaciones legales de la clínica.',
    'Derechos del paciente: conocer, actualizar, rectificar y suprimir sus datos, y revocar esta autorización en cualquier momento, salvo lo que la clínica deba conservar por obligación legal.',
    'Contacto: para ejercer sus derechos o hacer consultas, escriba a [Correo o teléfono de contacto].',
  ].join('\n\n'),
  generalText:
    'Autorizo el tratamiento de mis datos personales de identificación y contacto para las finalidades descritas en la política.',
  sensitiveHealthText:
    'Autorizo de forma expresa el tratamiento de mis datos sensibles de salud (historia clínica, odontograma, radiografías y antecedentes médicos) con la finalidad de prestarme la atención odontológica y conservar mi historia clínica. Se me informó que dar esta autorización es voluntario: no estoy obligado/a a darla.',
  marketingText:
    'Autorizo recibir comunicaciones comerciales (promociones, campañas y recordatorios no clínicos) por teléfono, WhatsApp o correo. Puedo revocarlo en cualquier momento.',
};

/**
 * Forma comparable de un texto: NFC, minúsculas, cada tramo de espacios
 * (incluidos nbsp y saltos de línea) en un solo espacio, y sin espacios justo
 * dentro de los corchetes.
 */
function comparable(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\[ /g, '[')
    .replace(/ \]/g, ']');
}

/**
 * Marcadores de la plantilla que siguen en algún texto del borrador, en el
 * orden de `POLICY_TEMPLATE_PLACEHOLDERS`. Sin distinguir mayúsculas ni
 * espacios, para atrapar también los de una plantilla anterior o retocados.
 * Solo busca esos literales: los corchetes propios de la clínica no cuentan.
 */
export function unfilledPlaceholders(draft: PublishPrivacyPolicyInput): string[] {
  const texts = [draft.policyText, draft.generalText, draft.sensitiveHealthText, draft.marketingText].map(
    comparable,
  );
  return POLICY_TEMPLATE_PLACEHOLDERS.filter((placeholder) => {
    const needle = comparable(placeholder);
    return texts.some((text) => text.includes(needle));
  });
}
