import type { PerioExamDetail, PerioSite, SavePerioMeasuresInput } from './perio-api';

/**
 * Modelo de la rejilla del periodontograma (DX-007): orden de dientes y
 * sitios, captura rápida por teclado y borrador local. Todo puro para poder
 * probarlo sin DOM.
 */

/** Arcada superior en orden de lectura: del 18 al 28. */
export const UPPER_TEETH: readonly number[] = [
  18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28,
];
/** Arcada inferior en orden de lectura: del 48 al 38. */
export const LOWER_TEETH: readonly number[] = [
  48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38,
];

export type PerioArch = 'upper' | 'lower';
export type PerioRow = 'buccal' | 'lingual';
export type PerioMeasure = 'probing' | 'recession';

export const ARCH_TEETH: Record<PerioArch, readonly number[]> = {
  upper: UPPER_TEETH,
  lower: LOWER_TEETH,
};

/** Umbral clínico: sondaje ≥4 mm se marca en rojo. */
export const PROBING_DANGER_MM = 4;

/** Cuadrantes FDI 1 y 2 (permanentes; 5 y 6 serían temporales, fuera de alcance). */
export function isUpperTooth(fdi: number): boolean {
  const quadrant = Math.floor(fdi / 10);
  return quadrant === 1 || quadrant === 2 || quadrant === 5 || quadrant === 6;
}

/** En los superiores la cara lingual se llama palatina. */
export function lingualLabel(upper: boolean): string {
  return upper ? 'Palatino' : 'Lingual';
}

/** Rótulo corto de un sitio («P» en vez de «L» en superiores). */
export function siteShortLabel(site: PerioSite, fdi: number): string {
  return isUpperTooth(fdi) ? site.replace('L', 'P') : site;
}

/**
 * Los tres sitios de una cara en el orden en que se VEN: el lado derecho del
 * paciente (cuadrantes 1 y 4) queda a la izquierda del gráfico, así que allí
 * va distal primero y mesial hacia la línea media; en 2 y 3, al revés.
 */
export function sitesForRow(fdi: number, row: PerioRow): PerioSite[] {
  const quadrant = Math.floor(fdi / 10);
  const rightSide = quadrant === 1 || quadrant === 4;
  const sites: PerioSite[] = row === 'buccal' ? ['MB', 'B', 'DB'] : ['ML', 'L', 'DL'];
  return rightSide ? [...sites].reverse() : sites;
}

export interface SiteCell {
  toothFdi: number;
  site: PerioSite;
}

/** Las 48 celdas (16 dientes x 3 sitios) de una fila, en orden visual. */
export function cellsInRow(arch: PerioArch, row: PerioRow): SiteCell[] {
  return ARCH_TEETH[arch].flatMap((toothFdi) =>
    sitesForRow(toothFdi, row).map((site) => ({ toothFdi, site })),
  );
}

export function probingTone(value: number | null): 'danger' | 'normal' {
  return value !== null && value >= PROBING_DANGER_MM ? 'danger' : 'normal';
}

/** NIC (CAL) = sondaje + recesión; sin recesión se asume margen en la UAC. */
export function calFor(site: {
  probingMm: number | null;
  recessionMm: number | null;
}): number | null {
  if (site.probingMm === null) return null;
  return Math.max(0, site.probingMm + (site.recessionMm ?? 0));
}

export type PendingPrefix = '' | '-' | '+';

export interface KeyResult {
  value: number | null;
  advance: boolean;
  pending: PendingPrefix;
}

/**
 * Captura rápida: un dígito fija el valor y salta al sitio siguiente. «-»
 * prepara un negativo (recesión con margen coronal a la UAC) y «+» suma 10
 * para 10–19 mm. Retroceso/Supr limpian. `null` = tecla no manejada.
 */
export function applyKey(
  key: string,
  current: number | null,
  pending: PendingPrefix,
): KeyResult | null {
  if (/^[0-9]$/.test(key)) {
    const digit = Number(key);
    const value = pending === '-' ? -digit : pending === '+' ? 10 + digit : digit;
    return { value, advance: true, pending: '' };
  }
  if (key === '-' || key === '+') {
    return { value: current, advance: false, pending: key };
  }
  if (key === 'Backspace' || key === 'Delete') {
    return { value: null, advance: false, pending: '' };
  }
  return null;
}

export interface CellRef {
  arch: PerioArch;
  row: PerioRow;
  measure: PerioMeasure;
  /** 0..47 dentro de la fila. */
  index: number;
}

const ROW_LENGTH = 48;

export type FocusMove = 'next' | 'prev' | 'up' | 'down';

/**
 * Siguiente celda: `next`/`prev` recorren la fila y pasan a la siguiente
 * (o anterior) de `rows`; `up`/`down` cambian de fila en la misma columna.
 * `null` si no hay a dónde ir.
 */
export function moveFocus(
  from: CellRef,
  move: FocusMove,
  rows: readonly PerioRow[],
): CellRef | null {
  const rowIndex = rows.indexOf(from.row);
  switch (move) {
    case 'next':
      if (from.index < ROW_LENGTH - 1) return { ...from, index: from.index + 1 };
      return rowIndex < rows.length - 1 ? { ...from, row: rows[rowIndex + 1], index: 0 } : null;
    case 'prev':
      if (from.index > 0) return { ...from, index: from.index - 1 };
      return rowIndex > 0 ? { ...from, row: rows[rowIndex - 1], index: ROW_LENGTH - 1 } : null;
    case 'up':
      return rowIndex > 0 ? { ...from, row: rows[rowIndex - 1] } : null;
    case 'down':
      return rowIndex < rows.length - 1 ? { ...from, row: rows[rowIndex + 1] } : null;
  }
}

export interface SiteValues {
  probingMm: number | null;
  recessionMm: number | null;
  furcation: number | null;
  bleeding: boolean;
  suppuration: boolean;
  plaque: boolean;
  calculus: boolean;
}

export interface ToothValues {
  mobility: number | null;
  skipped: boolean;
}

export const EMPTY_SITE: SiteValues = {
  probingMm: null,
  recessionMm: null,
  furcation: null,
  bleeding: false,
  suppuration: false,
  plaque: false,
  calculus: false,
};

export const EMPTY_TOOTH: ToothValues = { mobility: null, skipped: false };

export interface PerioDraft {
  /** Clave `${diente}:${sitio}`. */
  sites: Map<string, SiteValues>;
  teeth: Map<number, ToothValues>;
}

export function siteKey(toothFdi: number, site: PerioSite): string {
  return `${toothFdi}:${site}`;
}

export function emptyDraft(): PerioDraft {
  return { sites: new Map(), teeth: new Map() };
}

export function draftFromExam(exam: Pick<PerioExamDetail, 'sites' | 'teeth'>): PerioDraft {
  const draft = emptyDraft();
  for (const s of exam.sites) {
    draft.sites.set(siteKey(s.toothFdi, s.site), {
      probingMm: s.probingMm,
      recessionMm: s.recessionMm,
      furcation: s.furcation,
      bleeding: s.bleeding,
      suppuration: s.suppuration,
      plaque: s.plaque,
      calculus: s.calculus,
    });
  }
  for (const t of exam.teeth) {
    draft.teeth.set(t.toothFdi, { mobility: t.mobility, skipped: t.skipped });
  }
  return draft;
}

/** Solo lo tocado viaja al servidor; lo tocado y vacío limpia la celda. */
export function toSavePayload(
  draft: PerioDraft,
  dirtySites: ReadonlySet<string>,
  dirtyTeeth: ReadonlySet<number>,
): SavePerioMeasuresInput {
  const sites = [...dirtySites].map((key) => {
    const [tooth, site] = key.split(':');
    return {
      toothFdi: Number(tooth),
      site: site as PerioSite,
      ...(draft.sites.get(key) ?? EMPTY_SITE),
    };
  });
  const teeth = [...dirtyTeeth].map((toothFdi) => ({
    toothFdi,
    ...(draft.teeth.get(toothFdi) ?? EMPTY_TOOTH),
  }));
  return { sites, teeth };
}

export interface DraftIndices {
  sitesExamined: number;
  bopPercent: number;
  plaquePercent: number;
  sites4mmOrMore: number;
  sites6mmOrMore: number;
}

/**
 * Mismos índices que calcula la API (computePerioIndices), en vivo sobre el
 * borrador: % BOP, % placa, sitios ≥4 y ≥6 mm, sin dientes omitidos.
 */
export function computeDraftIndices(draft: PerioDraft): DraftIndices {
  let examined = 0;
  let bop = 0;
  let plaque = 0;
  let deep4 = 0;
  let deep6 = 0;
  for (const [key, s] of draft.sites) {
    const tooth = Number(key.split(':')[0]);
    if (draft.teeth.get(tooth)?.skipped) continue;
    const hasData = s.probingMm !== null || s.bleeding || s.suppuration || s.plaque || s.calculus;
    if (!hasData) continue;
    examined += 1;
    if (s.bleeding) bop += 1;
    if (s.plaque) plaque += 1;
    if ((s.probingMm ?? 0) >= 4) deep4 += 1;
    if ((s.probingMm ?? 0) >= 6) deep6 += 1;
  }
  const pct = (n: number) => (examined === 0 ? 0 : Math.round((n / examined) * 1000) / 10);
  return {
    sitesExamined: examined,
    bopPercent: pct(bop),
    plaquePercent: pct(plaque),
    sites4mmOrMore: deep4,
    sites6mmOrMore: deep6,
  };
}

/** Diferencia de sondaje respecto al examen anterior. */
export function probingTrend(
  current: number | null,
  previous: number | null,
): 'better' | 'worse' | 'same' | null {
  if (current === null || previous === null) return null;
  if (current < previous) return 'better';
  if (current > previous) return 'worse';
  return 'same';
}
