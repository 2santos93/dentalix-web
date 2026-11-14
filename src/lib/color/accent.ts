/**
 * White-label accent family.
 *
 * A clinic chooses ONE brand color. The design system needs seven accent
 * tokens per theme (fill, ink on the fill, hover, text, subtle bg, ink on the
 * subtle bg, border — see tokens.css), so they are DERIVED here, on the
 * server, and injected by the root layout as a `<style>` block.
 *
 * Contract: every derived pair meets WCAG 2.x AA with a 0.1 safety margin
 * (4.6:1 text, 3:1 boundaries), in light and dark, for any input hue. The
 * clinic's exact hex is preserved whenever it already passes as a fill; only
 * a failing color has its OKLCH lightness shifted (hue kept, chroma clamped
 * into sRGB), so the brand stays recognisable.
 *
 * Pure and dependency-free: it runs during SSR in the root layout, where a
 * throw would take the page down. Unparseable input returns `null` and the
 * caller keeps the factory tokens.
 */
import { parseHexColor, type Rgb } from './contrast';

export type AccentTokens = {
  primary: string;
  primaryFg: string;
  primaryHover: string;
  primaryText: string;
  primarySubtle: string;
  primarySubtleText: string;
  primaryBorder: string;
};

export type AccentFamily = { light: AccentTokens; dark: AccentTokens };

/* Surfaces the derived colors must read on — mirror tokens.css. */
const LIGHT = { surface: '#FFFFFF', canvas: '#F7F9FC', ink: '#151C26' };
const DARK = { surface: '#13171F', canvas: '#0B0F14', ink: '#0B0F14' };
const TEXT_MIN = 4.6;
const UI_MIN = 3;

export type Oklch = { l: number; c: number; h: number };
type Lin = [number, number, number];

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const fromLinear = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

function rgbToOklch({ r, g, b }: Rgb): Oklch {
  const [lr, lg, lb] = [r, g, b].map((v) => toLinear(v / 255));
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const h = (Math.atan2(B, A) * 180) / Math.PI;
  return { l: L, c: Math.hypot(A, B), h: h < 0 ? h + 360 : h };
}

function oklchToLinear({ l, c, h }: Oklch): Lin {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

const inGamut = (lin: Lin) => lin.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/** OKLCH → hex, reducing chroma (hue and lightness kept) until it fits sRGB. */
function toHex(color: Oklch): string {
  let c = color.c;
  let lin = oklchToLinear({ ...color, c });
  while (!inGamut(lin) && c > 0) {
    c = Math.max(0, c - 0.002);
    lin = oklchToLinear({ ...color, c });
  }
  return (
    '#' +
    lin
      .map((v) => Math.round(Math.min(1, Math.max(0, fromLinear(Math.min(1, Math.max(0, v))))) * 255))
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

function luminance(hex: string): number {
  const rgb = parseHexColor(hex)!;
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((v) => toLinear(v / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function ratio(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Walks lightness in `step` until `ok(hex)` holds (or L leaves [0.05, 0.98]). */
function walk(start: Oklch, step: number, ok: (hex: string) => boolean): string {
  let l = start.l;
  let hex = toHex({ ...start, l });
  while (!ok(hex) && (step < 0 ? l > 0.05 : l < 0.98)) {
    l += step;
    hex = toHex({ ...start, l });
  }
  return hex;
}

const passesOn = (min: number, ...bgs: string[]) => (hex: string) =>
  bgs.every((bg) => ratio(hex, bg) >= min);

function deriveLight(brand: string, o: Oklch): AccentTokens {
  let primary = brand;
  let primaryFg = '#FFFFFF';
  if (ratio(brand, '#FFFFFF') >= TEXT_MIN) {
    // Passes with white: keep the clinic's exact color.
  } else if (o.l >= 0.7 && ratio(brand, LIGHT.ink) >= TEXT_MIN) {
    // Light brand (yellow, lime, orange): keep it, write on it in ink.
    primaryFg = LIGHT.ink;
  } else {
    primary = walk(o, -0.005, (hex) => ratio(hex, '#FFFFFF') >= TEXT_MIN);
  }
  const fill = rgbToOklch(parseHexColor(primary)!);
  const primaryHover = toHex({ ...fill, l: fill.l + (primaryFg === '#FFFFFF' ? -0.055 : -0.045) });
  const primaryText = walk(o, -0.005, passesOn(TEXT_MIN, LIGHT.surface, LIGHT.canvas));
  const subtle = { l: 0.962, c: Math.min(0.22 * o.c, 0.03), h: o.h };
  const primarySubtle = toHex(subtle);
  const primarySubtleText = walk(
    { l: Math.min(0.45, rgbToOklch(parseHexColor(primaryText)!).l), c: Math.min(o.c, 0.09), h: o.h },
    -0.005,
    passesOn(TEXT_MIN, primarySubtle),
  );
  const primaryBorder = toHex({ l: 0.86, c: Math.min(o.c * 0.48, 0.06), h: o.h });
  return { primary, primaryFg, primaryHover, primaryText, primarySubtle, primarySubtleText, primaryBorder };
}

function deriveDark(o: Oklch): AccentTokens {
  const primary = walk(
    { ...o, l: Math.max(o.l, 0.68) },
    0.005,
    (hex) => ratio(hex, DARK.ink) >= TEXT_MIN && ratio(hex, DARK.surface) >= UI_MIN,
  );
  const fill = rgbToOklch(parseHexColor(primary)!);
  const primaryHover = toHex({ ...fill, l: Math.min(0.92, fill.l + 0.06) });
  const primaryText = walk(
    { ...fill, l: Math.min(0.92, fill.l + 0.04) },
    0.005,
    passesOn(TEXT_MIN, DARK.surface, DARK.canvas),
  );
  const primarySubtle = toHex({ l: 0.285, c: Math.min(o.c * 0.48, 0.045), h: o.h });
  const primarySubtleText = walk(
    { l: 0.84, c: Math.min(o.c * 0.85, 0.08), h: o.h },
    0.005,
    passesOn(TEXT_MIN, primarySubtle),
  );
  const primaryBorder = toHex({ l: 0.4, c: Math.min(o.c * 0.64, 0.06), h: o.h });
  return { primary, primaryFg: DARK.ink, primaryHover, primaryText, primarySubtle, primarySubtleText, primaryBorder };
}

/** OKLCH of a hex color (`null` if unparseable). DX-019: the settings screen's status-hue warning. */
export function hexToOklch(hex: string): Oklch | null {
  const rgb = parseHexColor(hex);
  return rgb ? rgbToOklch(rgb) : null;
}

/** Light and dark accent families for a clinic brand color, or `null`. */
export function accentFamily(brand: string): AccentFamily | null {
  const rgb = parseHexColor(brand);
  if (!rgb) return null;
  const hex = '#' + [rgb.r, rgb.g, rgb.b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
  const o = rgbToOklch(rgb);
  return { light: deriveLight(hex, o), dark: deriveDark(o) };
}

/** The CSS custom property each accent token is written to. */
export const ACCENT_VARS: Record<keyof AccentTokens, string> = {
  primary: '--color-primary',
  primaryFg: '--color-primary-fg',
  primaryHover: '--color-primary-hover',
  primaryText: '--color-primary-text',
  primarySubtle: '--color-primary-subtle',
  primarySubtleText: '--color-primary-subtle-text',
  primaryBorder: '--color-primary-border',
};

/** CSS declarations (`--color-primary:#…;…`) for one theme's accent family. */
export function accentDeclarations(tokens: AccentTokens, important = false): string {
  const bang = important ? ' !important' : '';
  return (Object.keys(ACCENT_VARS) as (keyof AccentTokens)[])
    .map((key) => `${ACCENT_VARS[key]}:${tokens[key]}${bang}`)
    .join(';');
}

/**
 * The `<style>` body the root layout injects for a tenant. `.dark` comes after
 * `:root` with equal specificity and `!important` on both, so each theme gets
 * its own family and neither can leak into the other.
 */
export function accentStyleSheet(brand: string): string | null {
  const family = accentFamily(brand);
  if (!family) return null;
  return `:root{${accentDeclarations(family.light, true)}}.dark{${accentDeclarations(family.dark, true)}}`;
}
