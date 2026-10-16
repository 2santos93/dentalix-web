/**
 * Contrast math for the white-label primary.
 *
 * A tenant only chooses the FILL (`--color-primary`, injected at SSR in
 * `layout.tsx`); the text that sits on top of it (`--color-primary-fg`) is a
 * design-system token, not tenant data. The factory primary was picked to pass
 * AA with white ("clinical teal-blue — AA with white", tokens.css), but nothing
 * guarantees that for an arbitrary tenant hue: a light brand color would render
 * white-on-light, and a dark one would render the dark-mode ink on dark.
 *
 * So the foreground is DERIVED here from the injected hue and injected next to
 * it. Both candidates are the existing tokens (`#FFFFFF` / `#052730`) so the
 * result never leaves the design system — this module picks between two system
 * values, it does not invent a color.
 *
 * Pure and dependency-free on purpose: it runs during SSR inside the root
 * layout's render, where anything that throws would take the whole page down.
 * Nothing here throws; unparseable input returns `null` and the caller falls
 * back to injecting the fill alone.
 */

/** `:root { --color-primary-fg }` in tokens.css — white ink for dark fills. */
export const PRIMARY_FG_LIGHT = '#FFFFFF';
/** `.dark { --color-primary-fg }` in tokens.css — deep teal ink for light fills. */
export const PRIMARY_FG_DARK = '#052730';

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const HEX_DIGITS = /^[0-9a-fA-F]+$/;

/**
 * `#RGB` / `#RGBA` / `#RRGGBB` / `#RRGGBBAA`, with or without the `#`.
 * The alpha channel is accepted (the branding validator lets 8 digits through)
 * but ignored: what a translucent fill composites against depends on the
 * surface under it, which is not knowable here. Any other length, or a
 * non-hex character, is unparseable → `null`.
 */
export function parseHexColor(value: string): Rgb | null {
  const hex = value.trim().replace(/^#/, '');
  if (!HEX_DIGITS.test(hex)) return null;

  let full: string;
  if (hex.length === 3 || hex.length === 4) {
    full = hex
      .slice(0, 3)
      .split('')
      .map((digit) => digit + digit)
      .join('');
  } else if (hex.length === 6 || hex.length === 8) {
    full = hex.slice(0, 6);
  } else {
    return null;
  }

  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** WCAG 2.1 sRGB → linear channel. */
function linearize(channel: number): number {
  const s = channel / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.1 relative luminance: 0.2126R + 0.7152G + 0.0722B, linearized. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

function ratioBetween(a: number, b: number): number {
  const [lighter, darker] = a >= b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG contrast ratio (1–21) between two hex colors, or `null` if either is unparseable. */
export function contrastRatio(a: string, b: string): number | null {
  const rgbA = parseHexColor(a);
  const rgbB = parseHexColor(b);
  if (!rgbA || !rgbB) return null;
  return ratioBetween(relativeLuminance(rgbA), relativeLuminance(rgbB));
}

/**
 * The foreground token that reads best on `primary`, or `null` when the color
 * can't be parsed.
 *
 * Both ratios are computed and compared rather than thresholding luminance at
 * 0.5: the two candidates aren't symmetric around the midpoint (`#052730` is
 * not the inverse of `#FFFFFF`), so a fixed threshold would hand the wrong one
 * to hues in the middle of the range. A tie keeps white, the `:root` default.
 */
export function primaryForeground(primary: string): string | null {
  const rgb = parseHexColor(primary);
  if (!rgb) return null;
  const luminance = relativeLuminance(rgb);

  // White first, so a tie keeps the `:root` default.
  let best = PRIMARY_FG_LIGHT;
  let bestRatio = -1;
  for (const candidate of [PRIMARY_FG_LIGHT, PRIMARY_FG_DARK]) {
    const candidateRgb = parseHexColor(candidate);
    if (!candidateRgb) continue;
    const ratio = ratioBetween(luminance, relativeLuminance(candidateRgb));
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = candidate;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// DX-121: texto sobre el color de un tipo de cita.
// ---------------------------------------------------------------------------

/** Texto claro sobre fondos oscuros (blanco del sistema). */
export const TYPE_TEXT_LIGHT = '#FFFFFF';
/** Texto oscuro sobre fondos claros (`--color-ink`). */
export const TYPE_TEXT_DARK = '#0F172A';
const AA_NORMAL_TEXT = 4.5;

/** El único formato de color de tipo que acepta la API: `#RRGGBB`. */
export function isAppointmentTypeColor(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}

/**
 * Color del texto de una tarjeta pintada con el color de su tipo: el que más
 * contraste da entre el blanco y la tinta del sistema. Para los grises medios
 * donde ninguno de los dos llega a AA (4.5:1), negro puro o blanco, que
 * siempre superan 4.58:1 sobre cualquier fondo opaco.
 */
export function appointmentTypeTextColor(background: string): string {
  const light = contrastRatio(background, TYPE_TEXT_LIGHT) ?? 0;
  const dark = contrastRatio(background, TYPE_TEXT_DARK) ?? 0;
  if (Math.max(light, dark) >= AA_NORMAL_TEXT) {
    return dark > light ? TYPE_TEXT_DARK : TYPE_TEXT_LIGHT;
  }
  const black = contrastRatio(background, '#000000') ?? 0;
  return black > light ? '#000000' : TYPE_TEXT_LIGHT;
}
