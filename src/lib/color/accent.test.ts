import { accentFamily, accentStyleSheet, ratio } from './accent';

const LIGHT_SURFACE = '#FFFFFF';
const LIGHT_CANVAS = '#F7F9FC';
const DARK_SURFACE = '#13171F';
const DARK_CANVAS = '#0B0F14';

// Brands that stress every branch: passing as-is, light brands that need ink,
// mid-tones that fail both, near-black, achromatic, saturated reds/greens.
const BRANDS = [
  '#0E7490', '#FACC15', '#22C55E', '#2277D3', '#EC4899', '#F97316',
  '#DC2626', '#111827', '#FFFFFF', '#000000', '#808080', '#7C3AED',
  '#06B6D4', '#A3E635', '#F43F5E', '#0EA5E9', '#14B8A6', '#ABC',
  // DX-115: los extremos del ticket que faltaban (celeste y amarillo claros).
  '#38BDF8', '#FDE047',
];

// DX-115: los cinco colores de tenant extremos del ticket.
const DX115_EXTREMES = ['#38BDF8', '#FDE047', '#7C3AED', '#0E7490', '#111827'];

describe('accentFamily', () => {
  it.each(BRANDS)('%s: every light pair meets AA', (brand) => {
    const { light } = accentFamily(brand)!;
    expect(ratio(light.primary, light.primaryFg)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(light.primaryText, LIGHT_SURFACE)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(light.primaryText, LIGHT_CANVAS)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(light.primarySubtleText, light.primarySubtle)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(BRANDS)('%s: every dark pair meets AA', (brand) => {
    const { dark } = accentFamily(brand)!;
    expect(ratio(dark.primary, dark.primaryFg)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(dark.primary, DARK_SURFACE)).toBeGreaterThanOrEqual(3);
    expect(ratio(dark.primaryText, DARK_SURFACE)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(dark.primaryText, DARK_CANVAS)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(dark.primarySubtleText, dark.primarySubtle)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps a passing brand hex exactly', () => {
    expect(accentFamily('#0e7490')!.light.primary).toBe('#0E7490');
    expect(accentFamily('#1D4ED8')!.light.primary).toBe('#1D4ED8');
  });

  it('keeps a light brand and writes on it in ink', () => {
    const { light } = accentFamily('#FACC15')!;
    expect(light.primary).toBe('#FACC15');
    expect(light.primaryFg).toBe('#151C26');
  });

  it('darkens a mid-tone that fails with both white and ink', () => {
    const { light } = accentFamily('#EC4899')!;
    expect(light.primary).not.toBe('#EC4899');
    expect(light.primaryFg).toBe('#FFFFFF');
  });

  it('returns null for unparseable input', () => {
    expect(accentFamily('teal')).toBeNull();
    expect(accentStyleSheet('#12')).toBeNull();
  });
});

describe('anillo de foco con colores de tenant extremos (DX-115)', () => {
  // El foco es un contorno de 2 px en `primary-text` (DESIGN.md): un objeto
  // gráfico pide ≥3:1 contra lo que tiene alrededor, en los dos temas.
  it.each(DX115_EXTREMES)('%s: ≥3:1 sobre surface y canvas, en claro y oscuro', (brand) => {
    const { light, dark } = accentFamily(brand)!;
    for (const ground of [LIGHT_SURFACE, LIGHT_CANVAS]) {
      expect(ratio(light.primaryText, ground)).toBeGreaterThanOrEqual(3);
    }
    for (const ground of [DARK_SURFACE, DARK_CANVAS]) {
      expect(ratio(dark.primaryText, ground)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('accentStyleSheet', () => {
  it('emits a light :root block followed by a .dark block, both !important', () => {
    const css = accentStyleSheet('#0E7490')!;
    expect(css.indexOf(':root{')).toBe(0);
    expect(css.indexOf('.dark{')).toBeGreaterThan(0);
    expect(css).toContain('--color-primary:#0E7490 !important');
    expect(css).toContain('--color-primary-subtle-text:');
  });
});
