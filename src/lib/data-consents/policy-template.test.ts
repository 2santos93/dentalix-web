import { POLICY_TEMPLATE, checkSensitiveHealthText } from './policy-template';

describe('checkSensitiveHealthText', () => {
  it('la plantilla trae las tres frases obligatorias', () => {
    expect(
      checkSensitiveHealthText(POLICY_TEMPLATE.sensitiveHealthText).every((c) => c.present),
    ).toBe(true);
  });

  it('marca lo que falta, sin distinguir tildes ni mayúsculas', () => {
    const checks = checkSensitiveHealthText('NO ESTÁ OBLIGADA a autorizar.');
    expect(checks.map((c) => [c.element, c.present])).toEqual([
      ['NOT_OBLIGED', true],
      ['SENSITIVE_DATA', false],
      ['PURPOSE', false],
    ]);
  });
});
