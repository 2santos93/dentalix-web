import {
  PRIMARY_FG_DARK,
  PRIMARY_FG_LIGHT,
  contrastRatio,
  parseHexColor,
  primaryForeground,
  relativeLuminance,
} from './contrast';

describe('parseHexColor', () => {
  it('parses 6-digit hex with and without the leading #', () => {
    expect(parseHexColor('#0E7490')).toEqual({ r: 0x0e, g: 0x74, b: 0x90 });
    expect(parseHexColor('0e7490')).toEqual({ r: 0x0e, g: 0x74, b: 0x90 });
  });

  it('expands 3-digit shorthand', () => {
    expect(parseHexColor('#0AF')).toEqual({ r: 0x00, g: 0xaa, b: 0xff });
    expect(parseHexColor('fff')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('accepts an alpha channel and ignores it', () => {
    expect(parseHexColor('#0E749080')).toEqual({ r: 0x0e, g: 0x74, b: 0x90 });
    expect(parseHexColor('#0AF8')).toEqual({ r: 0x00, g: 0xaa, b: 0xff });
  });

  it('returns null for garbage instead of throwing', () => {
    for (const value of ['', '#', 'rebeccapurple', '#12345', '#0E74901', 'red};body{display:none']) {
      expect(parseHexColor(value)).toBeNull();
    }
  });
});

describe('relativeLuminance', () => {
  it('anchors at the WCAG endpoints', () => {
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5);
  });
});

describe('contrastRatio', () => {
  it('returns 21 for black on white', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
  });

  it('matches the token comment: the factory primary is AA with white', () => {
    // tokens.css: "clinical teal-blue — AA with white".
    expect(contrastRatio('#0E7490', PRIMARY_FG_LIGHT)).toBeGreaterThan(4.5);
  });

  it('returns null when either color is unparseable', () => {
    expect(contrastRatio('nope', '#FFFFFF')).toBeNull();
    expect(contrastRatio('#FFFFFF', 'nope')).toBeNull();
  });
});

describe('primaryForeground', () => {
  it('picks white ink for a dark tenant hue', () => {
    // #1E3A8A: 10.36:1 with white vs 1.51:1 with the dark token.
    expect(primaryForeground('#1E3A8A')).toBe(PRIMARY_FG_LIGHT);
    expect(primaryForeground('#0E7490')).toBe(PRIMARY_FG_LIGHT);
  });

  it('picks the dark ink for a light tenant hue — the failure this exists for', () => {
    // #FACC15 (amber): white would be 1.53:1, the dark token is 10.24:1.
    expect(primaryForeground('#FACC15')).toBe(PRIMARY_FG_DARK);
    // The dark-mode default primary, injected as a tenant color, is light too.
    expect(primaryForeground('#2CC0D6')).toBe(PRIMARY_FG_DARK);
  });

  it('always returns the candidate with the higher ratio, not a luminance threshold', () => {
    for (const hue of ['#0E7490', '#2CC0D6', '#FACC15', '#7DD3FC', '#4ADE80', '#0B1120', '#777777']) {
      const chosen = primaryForeground(hue) as string;
      const other = chosen === PRIMARY_FG_LIGHT ? PRIMARY_FG_DARK : PRIMARY_FG_LIGHT;
      expect(contrastRatio(hue, chosen) as number).toBeGreaterThanOrEqual(
        contrastRatio(hue, other) as number,
      );
    }
  });

  it('returns null for malformed input so SSR can inject the fill alone', () => {
    expect(primaryForeground('')).toBeNull();
    expect(primaryForeground('teal')).toBeNull();
    expect(primaryForeground('#12345')).toBeNull();
    expect(() => primaryForeground('#')).not.toThrow();
  });
});
