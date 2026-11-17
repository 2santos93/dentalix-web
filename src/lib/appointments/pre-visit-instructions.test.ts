import {
  normalizePreVisitText,
  PRE_VISIT_MESSAGES,
  preVisitLead,
  preVisitTextError,
  resolvePreVisitInstruction,
  sortPreVisitInstructions,
} from './pre-visit-instructions';

describe('pre-visit-instructions (DX-564)', () => {
  const variants = [
    { language: 'es', text: 'Ven en ayunas.' },
    { language: 'en', text: 'Come fasting.' },
  ];

  it('resuelve exacta → base → español → nada (la regla de la API)', () => {
    expect(resolvePreVisitInstruction(variants, 'en')?.text).toBe('Come fasting.');
    expect(resolvePreVisitInstruction(variants, 'en-GB')?.text).toBe('Come fasting.');
    expect(resolvePreVisitInstruction(variants, 'ca')?.text).toBe('Ven en ayunas.');
    expect(resolvePreVisitInstruction(variants, null)?.text).toBe('Ven en ayunas.');
    expect(resolvePreVisitInstruction([variants[1]], 'fr')).toBeNull();
    expect(resolvePreVisitInstruction([], 'es')).toBeNull();
    expect(resolvePreVisitInstruction(undefined, 'es')).toBeNull();
  });

  it('valida como la API: enlaces, HTML y 600 caracteres; el «<» corriente vale', () => {
    expect(preVisitTextError('')).toBeNull();
    expect(preVisitTextError('   ')).toBeNull();
    expect(preVisitTextError('Lee https://example.com')).toBe(PRE_VISIT_MESSAGES.noLinks);
    expect(preVisitTextError('Mira www.example.com')).toBe(PRE_VISIT_MESSAGES.noLinks);
    expect(preVisitTextError('Texto <b>negrita</b>')).toBe(PRE_VISIT_MESSAGES.noLinks);
    expect(preVisitTextError('Tensión < 140 o > 90')).toBeNull();
    expect(preVisitTextError('ñ'.repeat(600))).toBeNull();
    expect(preVisitTextError('ñ'.repeat(601))).toBe(PRE_VISIT_MESSAGES.tooLong);
  });

  it('normaliza como la API: \\r\\n, tabuladores y controles', () => {
    expect(normalizePreVisitText(' a\r\nb\tc\u0007 ')).toBe('a\nb c');
  });

  it('ordena español primero y luego alfabético', () => {
    expect(sortPreVisitInstructions([{ language: 'pt' }, { language: 'en' }, { language: 'es' }]).map((v) => v.language)).toEqual([
      'es',
      'en',
      'pt',
    ]);
  });

  it('el rótulo sale del catálogo es/en; otro idioma, en español', () => {
    expect(preVisitLead('es')).toBe('Antes de tu cita:');
    expect(preVisitLead('en-GB')).toBe('Before your appointment:');
    expect(preVisitLead('ca')).toBe('Antes de tu cita:');
  });
});
