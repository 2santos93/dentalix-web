import {
  isValidShortcut,
  missingPlaceholdersMessage,
  replaceRange,
  shortcutBeforeCaret,
  unfilledPlaceholders,
} from './shortcuts';

const templates = [
  { id: 'a', shortcut: '#Resina', active: true },
  { id: 'b', shortcut: '#exo', active: false },
  { id: 'c', shortcut: null, active: true },
  { id: 'd', shortcut: '#Endodoncia', active: true },
];

describe('atajos de plantilla (DX-455)', () => {
  it('valida el mismo formato que la API', () => {
    expect(isValidShortcut('#resina')).toBe(true);
    expect(isValidShortcut('  #canal_2-a ')).toBe(true);
    expect(isValidShortcut('#ñandú')).toBe(true);
    expect(isValidShortcut('#r')).toBe(false);
    expect(isValidShortcut('resina')).toBe(false);
    expect(isValidShortcut('#resina fluida')).toBe(false);
    expect(isValidShortcut(`#${'a'.repeat(31)}`)).toBe(false);
  });

  it('casa «atajo + espacio» delante del cursor sin distinguir mayúsculas', () => {
    const text = 'Pieza 16 #RESINA ';
    expect(shortcutBeforeCaret(text, text.length, templates)).toEqual({
      template: templates[0],
      start: 9,
      end: text.length,
      token: '#RESINA',
    });
  });

  it('también tras un salto de línea o al principio', () => {
    expect(shortcutBeforeCaret('a\n#resina ', 10, templates)?.start).toBe(2);
    expect(shortcutBeforeCaret('#endodoncia ', 12, templates)?.template.id).toBe('d');
  });

  it('sin espacio, dentro de una palabra, desconocido o desactivado: nada', () => {
    expect(shortcutBeforeCaret('#resina', 7, templates)).toBeNull();
    expect(shortcutBeforeCaret('x#resina ', 9, templates)).toBeNull();
    expect(shortcutBeforeCaret('#otro ', 6, templates)).toBeNull();
    expect(shortcutBeforeCaret('#exo ', 5, templates)).toBeNull();
  });

  it('sustituye el tramo y deja el cursor al final de lo insertado', () => {
    expect(replaceRange('Antes #resina después', 6, 14, 'TEXTO')).toEqual({
      text: 'Antes TEXTOdespués',
      caret: 11,
    });
  });

  it('nombra los marcadores sin rellenar', () => {
    expect(unfilledPlaceholders('Diente {{Diente}}, {{Cara}} y {{Diente}}')).toEqual(['{{Diente}}', '{{Cara}}']);
    expect(missingPlaceholdersMessage([])).toBeNull();
    expect(missingPlaceholdersMessage(['{{Diente}}'])).toBe('Falta rellenar {{Diente}}.');
    expect(missingPlaceholdersMessage(['{{A}}', '{{B}}', '{{C}}'])).toBe('Faltan por rellenar {{A}}, {{B}} y {{C}}.');
  });
});
