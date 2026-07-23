/**
 * FDI two-digit tooth notation for the permanent dentition, ordered the
 * way an odontogram is drawn: each quadrant runs from the midline outward
 * for its "far" side and inward for its "near" side, matching the visual
 * layout (upper row left→right = 18..11, 21..28; lower row left→right =
 * 48..41, 31..38).
 */
export const PERMANENT_UPPER: string[] = [
  '18', '17', '16', '15', '14', '13', '12', '11',
  '21', '22', '23', '24', '25', '26', '27', '28',
];

export const PERMANENT_LOWER: string[] = [
  '48', '47', '46', '45', '44', '43', '42', '41',
  '31', '32', '33', '34', '35', '36', '37', '38',
];

export const ALL_PERMANENT: string[] = [...PERMANENT_UPPER, ...PERMANENT_LOWER];

const ALL_PERMANENT_SET = new Set(ALL_PERMANENT);

/** Whether `n` is one of the 32 permanent-dentition FDI codes above. */
export function isPermanentFdi(n: string): boolean {
  return ALL_PERMANENT_SET.has(n);
}
