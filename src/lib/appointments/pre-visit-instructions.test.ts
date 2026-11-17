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

  // Los mismos casos que la API (`dentalix-api: appointment-type-rules.spec.ts`).
  it.each([
    'Lee https://example.com antes',
    'Mira http://example.com',
    'Entra en www.example.com',
    'Ven en <b>ayunas</b>',
    'Trae esto </p>',
    '<a href="x">aquí</a>',
    '<script>alert(1)</script>',
    '<!-- nota -->',
    'Ven <br/> en ayunas',
    'Entra en ejemplo.com/login',
    'Mira bit.ly',
    'Más en ejemplo.com.ve, gracias',
    'Escribe a recepcion@ejemplo.com',
    'Correo: x@evil.com.',
    'Escribe a x@y.com',
    'Entra en EJEMPLO.COM',
    'Entra en Ejemplo.Com/login',
    'Síguenos en x.com',
    'Abre 192.168.0.1/login',
    'Abre 10.0.0.1',
    'Tienda: tienda.com.VE.',
    'Puerto: ejemplo.io:8080',
  ])('rechaza enlaces, dominios, IPv4, emails y HTML con el mensaje de la API: %j', (text) => {
    expect(preVisitTextError(text)).toBe(PRE_VISIT_MESSAGES.noLinks);
  });

  it.each([
    'Ven 15 min antes: si la presión es < 140 o > 90 avisa',
    'Toma 1 comprimido 2 h antes (< 1 g).',
    'Escribe a recepción@clínica si tienes dudas',
    'Ven en ayunas de 6h.Trae tus radiografías.',
    'Te atiende el Dr.Pérez.',
    'Llega a las 10.30 h.',
    'Ven a las 9 a.m. en punto.',
    'Trae, p.ej. tus radiografías.',
    'Te atiende el Sr.García.',
    'Toma 1.5 ml del jarabe.',
    'Llega a las 10.30 h y trae 2.5 cm de gasa.',
    'Ven a las 9 p.m.',
    'Si la presión es < 140 avísanos.',
  ])('no marca texto corriente: %j', (text) => {
    expect(preVisitTextError(text)).toBeNull();
  });

  it.each([
    ['espacio de ancho cero', 0x200b],
    ['guion suave', 0xad],
    ['inversión de dirección (U+202E)', 0x202e],
  ])('quita %s y detecta el dominio que partía', (_label, code) => {
    const ch = String.fromCharCode(code);
    expect(preVisitTextError(`Entra en ejemplo${ch}.com`)).toBe(PRE_VISIT_MESSAGES.noLinks);
    expect(normalizePreVisitText(`Ven${ch} en ayunas`)).toBe('Ven en ayunas');
  });

  it('normaliza como la API: \\r\\n, tabuladores y controles', () => {
    expect(normalizePreVisitText(' a\r\nb\tc\u0007 ')).toBe('a\nb c');
    // Formato invisible fuera (salvo U+200D), espacios al final de línea y como mucho una línea en blanco.
    expect(normalizePreVisitText('eje\u200bmplo  \n\n\n\nfin')).toBe('ejemplo\n\nfin');
    expect(normalizePreVisitText('👨\u200d👩')).toBe('👨\u200d👩');
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
