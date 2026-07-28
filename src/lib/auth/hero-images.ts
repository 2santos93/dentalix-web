/**
 * Banco de imágenes hero del login (panel derecho del split).
 * Fotos locales en `public/auth/` (licencia Unsplash, uso libre).
 * La selección aleatoria ocurre en el server component de `/login`, que es
 * dinámico (usa `headers()`), así que rota en cada carga sin hydration mismatch.
 */
export interface HeroImage {
  src: string;
  alt: string;
}

export const HERO_IMAGES: HeroImage[] = [
  { src: '/auth/hero-1.jpg', alt: 'Odontólogo revisando radiografías dentales' },
  { src: '/auth/hero-2.jpg', alt: 'Dentista mostrando una radiografía a su paciente' },
  { src: '/auth/hero-3.jpg', alt: 'Paciente con un alineador dental transparente' },
  { src: '/auth/hero-4.jpg', alt: 'Consultorio odontológico moderno' },
  { src: '/auth/hero-5.jpg', alt: 'Clínica dental con sillones y equipo profesional' },
];

/** Normaliza cualquier índice entero al rango válido del banco. */
export function pickHeroImage(index: number): HeroImage {
  const n = HERO_IMAGES.length;
  const normalized = ((Math.trunc(index) % n) + n) % n;
  return HERO_IMAGES[normalized];
}

/** Elige una imagen al azar (para el server component en cada request). */
export function randomHeroImage(): HeroImage {
  return pickHeroImage(Math.floor(Math.random() * HERO_IMAGES.length));
}
