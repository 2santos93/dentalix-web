import { accentFamily, hexToOklch, ratio, type AccentFamily } from './accent';

/**
 * DX-019: lo que Ajustes › Datos de la clínica le dice al ADMIN sobre el color
 * que elige. El color NUNCA rompe el contraste: `accent.ts` deriva la familia
 * con AA garantizado en claro y oscuro. Aquí solo se avisa:
 *
 * - `lowContrast`: con texto blanco el color no llega a AA (4,5:1). Entonces
 *   o los botones escriben en oscuro sobre él (`inkText`, colores claros) o
 *   usan un tono ajustado de la misma tonalidad (`adjusted`).
 * - `statusHue`: su tonalidad está cerca de la de un estado fijo (peligro,
 *   aviso, correcto) y el acento podría leerse como un estado (DESIGN.md →
 *   «The Status Rule»; el teal por defecto está a ≥ 70° de los tres).
 */

/** Sólidos de los estados fijos (DESIGN.md → Semantic; nunca de la clínica). */
export const STATUS_HUES = {
  danger: { hex: '#C52C2A', label: 'peligro (rojo de alertas y errores)' },
  warning: { hex: '#EFA831', label: 'aviso (ámbar de pendientes)' },
  success: { hex: '#287C42', label: 'correcto (verde de pagado y hecho)' },
} as const;
export type StatusHue = keyof typeof STATUS_HUES;

/** Por debajo de esta distancia de tonalidad (grados OKLCH), el acento se confunde con el estado. */
export const STATUS_HUE_MIN_DISTANCE = 30;
/** Con menos croma el color es casi gris: su tonalidad no se percibe. */
const MIN_CHROMA = 0.04;

export const HEX6 = /^#[0-9a-fA-F]{6}$/;

export interface BrandColorReport {
  family: AccentFamily;
  /** Con texto blanco no llega a 4,5:1 (WCAG AA). */
  lowContrast: boolean;
  /** Contraste del color exacto con texto blanco. */
  whiteRatio: number;
  /** El color exacto no sirve de relleno: los botones usan un tono ajustado. */
  adjusted: boolean;
  /** Color claro que se conserva escribiendo encima en oscuro. */
  inkText: boolean;
  /** Estado fijo al que se parece, o `null`. */
  statusHue: StatusHue | null;
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Informe del color, o `null` si no es un `#RRGGBB`. */
export function brandColorReport(hex: string): BrandColorReport | null {
  if (!HEX6.test(hex)) return null;
  const family = accentFamily(hex);
  const brand = hexToOklch(hex);
  if (!family || !brand) return null;
  const exact = hex.toUpperCase();
  const adjusted = family.light.primary.toUpperCase() !== exact;
  const whiteRatio = ratio(exact, '#FFFFFF');
  const inkText = !adjusted && family.light.primaryFg !== '#FFFFFF';
  let statusHue: StatusHue | null = null;
  if (brand.c >= MIN_CHROMA) {
    let closest = Infinity;
    for (const key of Object.keys(STATUS_HUES) as StatusHue[]) {
      const status = hexToOklch(STATUS_HUES[key].hex)!;
      const distance = hueDistance(brand.h, status.h);
      if (distance < STATUS_HUE_MIN_DISTANCE && distance < closest) {
        closest = distance;
        statusHue = key;
      }
    }
  }
  return { family, lowContrast: whiteRatio < 4.5, whiteRatio, adjusted, inkText, statusHue };
}
