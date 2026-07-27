import { HERO_IMAGES, pickHeroImage, randomHeroImage } from './hero-images';

describe('hero-images', () => {
  it('tiene exactamente 5 imágenes con src y alt no vacíos', () => {
    expect(HERO_IMAGES).toHaveLength(5);
    for (const img of HERO_IMAGES) {
      expect(img.src).toMatch(/^\/auth\/hero-\d+\.jpg$/);
      expect(img.alt.length).toBeGreaterThan(0);
    }
  });

  it('pickHeroImage devuelve la entrada en un índice válido', () => {
    expect(pickHeroImage(0)).toBe(HERO_IMAGES[0]);
    expect(pickHeroImage(3)).toBe(HERO_IMAGES[3]);
  });

  it('pickHeroImage normaliza índices fuera de rango y negativos', () => {
    expect(pickHeroImage(HERO_IMAGES.length)).toBe(HERO_IMAGES[0]);
    expect(pickHeroImage(HERO_IMAGES.length + 1)).toBe(HERO_IMAGES[1]);
    expect(pickHeroImage(-1)).toBe(HERO_IMAGES[HERO_IMAGES.length - 1]);
  });

  it('randomHeroImage devuelve siempre una entrada del banco', () => {
    for (let i = 0; i < 20; i++) {
      expect(HERO_IMAGES).toContain(randomHeroImage());
    }
  });
});
