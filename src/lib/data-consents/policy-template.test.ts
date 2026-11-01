import { citesLaw } from '@/architecture/law-citation';
import type { PublishPrivacyPolicyInput } from './data-consents-api';
import {
  POLICY_TEMPLATE,
  POLICY_TEMPLATE_PLACEHOLDERS,
  unfilledPlaceholderFields,
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

  it('atrapa el marcador con espacios distintos dentro: nbsp, doble espacio o salto de línea', () => {
    for (const variant of ['[Nombre\u00a0de la clínica]', '[Nombre  de la clínica]', '[Nombre de la\nclínica]']) {
      expect({ variant, found: unfilledPlaceholders({ ...FILLED, policyText: `Responsable: ${variant}.` }) }).toEqual({
        variant,
        found: ['[Nombre de la clínica]'],
      });
    }
  });

  it('atrapa el marcador con espacios junto a los corchetes', () => {
    expect(unfilledPlaceholders({ ...FILLED, policyText: 'Con domicilio en [ Dirección ].' })).toEqual(['[Dirección]']);
  });

  it('atrapa el marcador con espacios invisibles dentro y junto a los corchetes', () => {
    for (const [name, invisible] of [
      ['ZWSP', '\u200B'],
      ['ZWNJ', '\u200C'],
      ['ZWJ', '\u200D'],
      ['WJ', '\u2060'],
      ['BOM', '\uFEFF'],
    ]) {
      for (const variant of [
        `[Direc${invisible}ción]`,
        `[${invisible}Dirección]`,
        `[Dirección${invisible}]`,
        `[ ${invisible}Dirección${invisible} ]`,
        `${invisible}[Dirección]`,
      ]) {
        expect({ name, variant, found: unfilledPlaceholders({ ...FILLED, policyText: `En ${variant}.` }) }).toEqual({
          name,
          variant,
          found: ['[Dirección]'],
        });
      }
    }
  });

  it('unfilledPlaceholderFields dice en qué campos queda cada marcador', () => {
    expect(
      unfilledPlaceholderFields({
        ...FILLED,
        policyText: 'Ver [Dirección].',
        marketingText: 'Escriba a [Dirección] o a [Correo o teléfono de contacto].',
      }),
    ).toEqual([
      { placeholder: '[Dirección]', fields: ['policyText', 'marketingText'] },
      { placeholder: '[Correo o teléfono de contacto]', fields: ['marketingText'] },
    ]);
  });

  it('no bloquea los corchetes propios de la clínica', () => {
    expect(
      unfilledPlaceholders({ ...FILLED, policyText: 'Ver [ anexo  1 ] y [Nombre del paciente].' }),
    ).toEqual([]);
  });
});
