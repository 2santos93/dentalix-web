import { accentFamily } from '@/lib/color/accent';
import { publicBrandStyle } from './public-page';

describe('publicBrandStyle', () => {
  it('inyecta la familia de acento clara completa de la clínica', () => {
    const style = publicBrandStyle({ primaryColor: '#7C3AED' }) as Record<string, string>;
    const light = accentFamily('#7C3AED')!.light;
    expect(style).toEqual({
      '--color-primary': light.primary,
      '--color-primary-fg': light.primaryFg,
      '--color-primary-hover': light.primaryHover,
      '--color-primary-text': light.primaryText,
      '--color-primary-subtle': light.primarySubtle,
      '--color-primary-subtle-text': light.primarySubtleText,
      '--color-primary-border': light.primaryBorder,
    });
  });

  it('un color de marca que ya vale como relleno se conserva tal cual', () => {
    const style = publicBrandStyle({ primaryColor: '#0E7490' }) as Record<string, string>;
    expect(style['--color-primary'].toUpperCase()).toBe('#0E7490');
  });

  it('sin color o con uno que no es hex, nada (se quedan los tokens de fábrica)', () => {
    expect(publicBrandStyle(null)).toBeUndefined();
    expect(publicBrandStyle({ primaryColor: null })).toBeUndefined();
    expect(publicBrandStyle({ primaryColor: 'red' })).toBeUndefined();
  });
});
