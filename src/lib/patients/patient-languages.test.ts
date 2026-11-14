import { languageName, languageOptions, preferredLanguageLabel } from './patient-languages';

describe('patient-languages (DX-497)', () => {
  it('nombra cada idioma en sí mismo, con su código', () => {
    expect(languageName('en')).toBe('English (en)');
    expect(languageName('ca')).toBe('Català (ca)');
    expect(languageName('es')).toBe('Español (es)');
  });

  it('la ficha: clínica, disponible o «(no disponible) ca»', () => {
    expect(preferredLanguageLabel(null, ['es'])).toBe('Idioma de la clínica');
    expect(preferredLanguageLabel('en', ['es', 'en'])).toBe('English (en)');
    expect(preferredLanguageLabel('ca', ['es', 'en'])).toBe('(no disponible) ca');
  });

  it('opciones: «Idioma de la clínica» primero; un retirado del paciente se conserva marcado', () => {
    expect(languageOptions(['es', 'en'], 'es', 'ca')).toEqual([
      { value: '', label: 'Idioma de la clínica · Español (es)' },
      { value: 'en', label: 'English (en)' },
      { value: 'ca', label: '(no disponible) ca' },
    ]);
  });
});
