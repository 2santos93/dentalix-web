import { platformInstant } from './platform-instant';

describe('platformInstant (DX-354b, E8)', () => {
  it('escribe el instante en UTC con la palabra «UTC»', () => {
    expect(platformInstant('2026-11-03T14:05:00.000Z')).toBe('2026-11-03 14:05 UTC');
    expect(platformInstant('2026-11-03T14:05:59.999Z')).toBe('2026-11-03 14:05 UTC');
  });

  it('medianoche y fin de día: el día es el de UTC, no el del entorno', () => {
    expect(platformInstant('2026-11-03T00:00:00.000Z')).toBe('2026-11-03 00:00 UTC');
    expect(platformInstant('2026-11-03T23:59:00.000Z')).toBe('2026-11-03 23:59 UTC');
    // Un desfase: 22:30 en Caracas (−04:00) es ya el día siguiente en UTC.
    expect(platformInstant('2026-11-03T22:30:00-04:00')).toBe('2026-11-04 02:30 UTC');
    expect(platformInstant('2026-11-04T01:30:00+09:00')).toBe('2026-11-03 16:30 UTC');
  });

  it('año bisiesto: existe el 29 de febrero', () => {
    expect(platformInstant('2028-02-29T12:00:00.000Z')).toBe('2028-02-29 12:00 UTC');
    expect(platformInstant('2028-03-01T00:00:00.000Z')).toBe('2028-03-01 00:00 UTC');
    // El año común pasa del 28 de febrero al 1 de marzo.
    expect(platformInstant('2027-02-28T23:59:00.000Z')).toBe('2027-02-28 23:59 UTC');
  });

  it('sin dato o con un dato que no es una fecha: «—»', () => {
    expect(platformInstant(null)).toBe('—');
    expect(platformInstant(undefined)).toBe('—');
    expect(platformInstant('')).toBe('—');
    expect(platformInstant('no es una fecha')).toBe('—');
    expect(platformInstant('2026-13-45T99:99:99Z')).toBe('—');
  });

  it('un año fuera de 0000–9999 no se pinta con signo', () => {
    expect(platformInstant('+275760-09-13T00:00:00.000Z')).toBe('—');
  });

  it('no depende de TZ ni del locale: nunca lleva a. m./p. m. ni separadores locales', () => {
    const text = platformInstant('2026-11-03T14:05:00.000Z');
    expect(text).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/);
    expect(text).not.toMatch(/[ap]\. ?m\./i);
  });
});
