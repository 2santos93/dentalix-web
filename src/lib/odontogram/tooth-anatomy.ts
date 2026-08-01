/**
 * Chart anatomy derived from the FDI code, kept out of the components so the
 * drawing stays declarative and the clinical rules are unit-tested.
 *
 * FDI: first digit = quadrant, second = position from the midline (1 central
 * incisor … 8 second molar). Quadrants are named from the PATIENT's point of
 * view (1 upper-right, 2 upper-left, 3 lower-left, 4 lower-right), and an
 * odontogram is drawn facing the patient — so the patient's right (quadrants
 * 1 and 4) is the LEFT half of the chart.
 */

export type ToothClass = 'incisor' | 'canine' | 'premolar' | 'molar';
export type Arch = 'upper' | 'lower';
/** Which half of the CHART a tooth is drawn in (not which side of the patient). */
export type ChartSide = 'left' | 'right';

export function toothQuadrant(fdi: string): number {
  return Number(fdi[0]);
}

export function toothPosition(fdi: string): number {
  return Number(fdi[1]);
}

export function toothClass(fdi: string): ToothClass {
  const position = toothPosition(fdi);
  if (position <= 2) return 'incisor';
  if (position === 3) return 'canine';
  if (position <= 5) return 'premolar';
  return 'molar';
}

export function toothArch(fdi: string): Arch {
  const quadrant = toothQuadrant(fdi);
  return quadrant === 1 || quadrant === 2 ? 'upper' : 'lower';
}

export function toothChartSide(fdi: string): ChartSide {
  const quadrant = toothQuadrant(fdi);
  return quadrant === 1 || quadrant === 4 ? 'left' : 'right';
}

/**
 * Rendered width in px per tooth class — the reason the chart reads as a
 * dental arch instead of 32 identical squares. The SVG viewBox stays 40×40
 * for every tooth (so the surface geometry is one shared definition) and is
 * stretched to these widths with `preserveAspectRatio="none"`; strokes keep
 * their 1px weight via `vector-effect: non-scaling-stroke`.
 */
export const TOOTH_WIDTH: Record<ToothClass, number> = {
  incisor: 24,
  canine: 27,
  premolar: 31,
  molar: 38,
};

export const TOOTH_HEIGHT = 40;

export function toothWidth(fdi: string): number {
  return TOOTH_WIDTH[toothClass(fdi)];
}

/**
 * Mirrors that put every surface where the mouth actually has it. The shared
 * geometry is drawn for quadrant 2 (upper-left of the patient, right half of
 * the chart): vestibular up, lingual down, mesial left, distal right.
 *
 * - Vestibular faces AWAY from the occlusal plane, so the lower arch
 *   (quadrants 3 and 4) mirrors vertically.
 * - Mesial always faces the midline, which sits to the RIGHT of the teeth
 *   drawn in the chart's left half (quadrants 1 and 4), so those mirror
 *   horizontally.
 *
 * This replaces the v1 simplification (a single fixed screen orientation for
 * all 32 teeth) that `tooth.tsx` used to document as a known inaccuracy.
 */
export function surfaceMirror(fdi: string): { scaleX: 1 | -1; scaleY: 1 | -1 } {
  return {
    scaleX: toothChartSide(fdi) === 'left' ? -1 : 1,
    scaleY: toothArch(fdi) === 'lower' ? -1 : 1,
  };
}

/**
 * The `transform` for the surface group, or `undefined` when none is needed
 * (quadrant 2, whose orientation the geometry is authored in). Translating by
 * the viewBox extent before scaling keeps the mirrored group inside the box.
 */
export function toothTransform(fdi: string): string | undefined {
  const { scaleX, scaleY } = surfaceMirror(fdi);
  if (scaleX === 1 && scaleY === 1) return undefined;
  const dx = scaleX === -1 ? 40 : 0;
  const dy = scaleY === -1 ? 40 : 0;
  return `translate(${dx}, ${dy}) scale(${scaleX}, ${scaleY})`;
}
