import { citesLaw } from '@/architecture/law-citation';
import type { PublishPrivacyPolicyInput } from './data-consents-api';
import {
  POLICY_TEMPLATE,
  POLICY_TEMPLATE_PLACEHOLDERS,
  unfilledPlaceholders,
} from './policy-template';

const FILLED: PublishPrivacyPolicyInput = {
  policyText: 'Responsable del tratamiento: Clínica Sonrisa, con domicilio en Av. Principal 10.',
  generalText: 'Autorizo el tratamiento de mis datos personales.',
  sensitiveHealthText: 'Autorizo el tratamiento de mis datos de salud.',
  marketingText: 'Autorizo recibir comunicaciones comerciales.',
};

const texts = (draft: PublishPrivacyPolicyInput): string[] => [
  draft.policyText,
  draft.generalText,
  draft.sensitiveHealthText,
  draft.marketingText,
];

describe('POLICY_TEMPLATE', () => {
  it('la plantilla no cita leyes, autoridades ni países', () => {
    const lines = texts(POLICY_TEMPLATE).flatMap((text) => text.split('\n'));
    expect(lines.filter((line) => citesLaw(line) || /Colombia|España|Venezuela/.test(line))).toEqual([]);
  });

  it('la política tiene las cuatro secciones', () => {
    const { policyText } = POLICY_TEMPLATE;
    expect(policyText.startsWith('Responsable del tratamiento:')).toBe(true);
    expect(policyText).toContain('\n\nFinalidades:');
    expect(policyText).toContain('\n\nDerechos del paciente:');
    expect(policyText).toContain('\n\nContacto:');
  });

  it('cada marcador de la lista aparece en la política', () => {
    for (const placeholder of POLICY_TEMPLATE_PLACEHOLDERS) {
      expect(POLICY_TEMPLATE.policyText).toContain(placeholder);
    }
  });

  // Borrar cuando ninguna réplica de la API sea anterior a DX-325.
  it('la plantilla pasa la validación de una API anterior a DX-325', () => {
    const folded = POLICY_TEMPLATE.sensitiveHealthText
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
    for (const pattern of [
      /\bno\s+(esta|estoy|estas)\s+obligad[oa]s?\b|\bno\s+es\s+obligatori[oa]\b/,
      /\bdatos\s+sensibles\b/,
      /\bfinalidad(es)?\b/,
    ]) {
      expect({ pattern: String(pattern), matches: pattern.test(folded) }).toEqual({
        pattern: String(pattern),
        matches: true,
      });
    }
  });
});

describe('unfilledPlaceholders', () => {
  it('unfilledPlaceholders devuelve los marcadores que quedan, en cualquier texto', () => {
    expect(unfilledPlaceholders(POLICY_TEMPLATE)).toEqual([
      '[Nombre de la clínica]',
      '[Dirección]',
      '[Correo o teléfono de contacto]',
    ]);
    expect(unfilledPlaceholders(FILLED)).toEqual([]);
    expect(unfilledPlaceholders({ ...FILLED, marketingText: 'Escriba a [Dirección].' })).toEqual(['[Dirección]']);
    expect(unfilledPlaceholders({ ...FILLED, policyText: 'Ver anexo [nota].' })).toEqual([]);
    expect(
      unfilledPlaceholders({ ...FILLED, policyText: 'Canal de atención: [correo o teléfono de contacto].' }),
    ).toEqual(['[Correo o teléfono de contacto]']);
  });
});
