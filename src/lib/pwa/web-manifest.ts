import { accentFamily } from '@/lib/color/accent';
import { initials } from '@/lib/format/initials';
import type { MetadataRoute } from 'next';
import type { Branding } from '@/lib/branding';

/**
 * Manifest de la app instalable (DX-405, absorbe DX-219), POR CLÍNICA: cada
 * clínica tiene su host, así que `/manifest.webmanifest` de su host lleva su
 * nombre, su color y su icono. Sin clínica (plataforma, host desconocido),
 * el de Dentalix.
 */
export const PRODUCT_NAME = 'Dentalix';
/** Lienzo claro (tokens.css `--color-canvas`), el mismo que la barra del sistema. */
export const MANIFEST_BACKGROUND = '#F7F9FC';
/** Acento de fábrica (DESIGN.md: Clinical Teal) cuando la clínica no eligió uno. */
export const FACTORY_ACCENT = '#0E7490';
export const ICON_SIZES = [180, 192, 512] as const;
export type IconSize = (typeof ICON_SIZES)[number];

export function isIconSize(value: number): value is IconSize {
  return (ICON_SIZES as readonly number[]).includes(value);
}

/** Color y tinta del icono: la familia derivada del color de la clínica (siempre AA). */
export function iconColors(brand: string | null): { fill: string; ink: string } {
  const family = brand ? accentFamily(brand) : null;
  if (!family) return { fill: FACTORY_ACCENT, ink: '#FFFFFF' };
  return { fill: family.light.primary, ink: family.light.primaryFg };
}

/** Letras del icono: iniciales del nombre de la clínica, o «D» de Dentalix. */
export function iconMonogram(name: string | null): string {
  const letters = name ? initials(name) : '';
  return letters || PRODUCT_NAME.charAt(0);
}

/** `short_name`: el nombre si es corto; si no, su primera palabra (≤ 12 caracteres visibles bajo el icono). */
export function shortName(name: string): string {
  if (name.length <= 12) return name;
  const first = name.split(/\s+/)[0] ?? name;
  return first.length <= 12 ? first : first.slice(0, 12);
}

export function buildWebManifest(branding: Pick<Branding, 'name' | 'primaryColor'>): MetadataRoute.Manifest & {
  icons: NonNullable<MetadataRoute.Manifest['icons']>;
} {
  const name = branding.name ?? PRODUCT_NAME;
  return {
    id: '/',
    name,
    short_name: shortName(name),
    description: branding.name ? `${branding.name} · ${PRODUCT_NAME}` : 'Plataforma de gestión odontológica',
    lang: 'es',
    dir: 'ltr',
    // La agenda: lo primero del día, y lo que abre sin conexión.
    start_url: '/agenda',
    scope: '/',
    display: 'standalone',
    background_color: MANIFEST_BACKGROUND,
    theme_color: iconColors(branding.primaryColor).fill,
    icons: [
      { src: '/pwa-icon/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icon/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icon/512?maskable=1', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
