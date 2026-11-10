/**
 * Banco de imágenes hero del login (panel derecho del split).
 * Fotos locales en `public/auth/` (licencia Unsplash, uso libre).
 * La selección aleatoria ocurre en el server component de cada página de acceso
 * (login, registro, verificación, contraseña, invitación), dinámicas porque el
 * layout raíz y `authContext()` usan `headers()`: rota en cada carga y viaja
 * como prop a `AuthLayout`, sin hydration mismatch.
 *
 * DX-117 (FE-023): cada foto existe también en AVIF y WebP (generadas una vez
 * con sharp desde el JPG, calidad 60 y 75). `AuthLayout` las sirve con
 * `<picture>` solo desde `lg`; el JPG queda como respaldo del navegador que no
 * entienda ninguna de las dos.
 */
export interface HeroImage {
  /** JPG original: respaldo del `<img>`. */
  src: string;
  avif: string;
  webp: string;
  alt: string;
}

function hero(n: number, alt: string): HeroImage {
  const base = `/auth/hero-${n}`;
  return { src: `${base}.jpg`, avif: `${base}.avif`, webp: `${base}.webp`, alt };
}

export const HERO_IMAGES: HeroImage[] = [
  hero(1, 'Odontólogo revisando radiografías dentales'),
  hero(2, 'Dentista mostrando una radiografía a su paciente'),
  hero(3, 'Paciente con un alineador dental transparente'),
  hero(4, 'Consultorio odontológico moderno'),
  hero(5, 'Clínica dental con sillones y equipo profesional'),
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
