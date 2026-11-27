import { PERMANENT_LOWER, PERMANENT_UPPER } from './fdi';
import type { Arch } from './tooth-anatomy';

/**
 * Dentición en la carta (DX-120), espejo de `domain/dentition.ts` de la API.
 * Cada una de las 32 posiciones se nombra por su código FDI permanente; el
 * temporal que la ocupa es el mismo código con el cuadrante + 4 (el 55 ocupa
 * la 15). Los molares (posiciones 6-8) no tienen temporal: en dentición
 * temporal aparecen «sin erupcionar» y nunca están en mixta.
 */
export type DentitionType = 'PERMANENT' | 'PRIMARY' | 'MIXED';
export type DentitionReason = 'MANUAL' | 'ERUPTION' | 'EXFOLIATION';

export const DENTITION_LABELS: Record<DentitionType, string> = {
  PERMANENT: 'Permanente',
  MIXED: 'Mixta',
  PRIMARY: 'Temporal',
};

/** Orden del conmutador «Permanente · Mixta · Temporal». */
export const DENTITION_ORDER: DentitionType[] = ['PERMANENT', 'MIXED', 'PRIMARY'];

export const DENTITION_REASON_LABELS: Record<DentitionReason, string> = {
  MANUAL: 'Cambio manual',
  ERUPTION: 'Erupción',
  EXFOLIATION: 'Exfoliación (cae el temporal)',
};

export const ALL_POSITIONS: string[] = [...PERMANENT_UPPER, ...PERMANENT_LOWER];

export function isPrimaryFdi(fdi: string): boolean {
  return /^[5-8][1-5]$/.test(fdi);
}

/** Posición (código FDI permanente) que ocupa un diente. */
export function positionOfTooth(fdi: string): string {
  const quadrant = Number(fdi[0]);
  return quadrant > 4 ? `${quadrant - 4}${fdi[1]}` : fdi;
}

/** ¿La posición tiene diente temporal (incisivos, canino y molares temporales)? */
export function hasPrimaryPredecessor(position: string): boolean {
  return Number(position[1]) <= 5;
}

/** El temporal de una posición, o null en los molares. */
export function primaryAtPosition(position: string): string | null {
  return hasPrimaryPredecessor(position) ? `${Number(position[0]) + 4}${position[1]}` : null;
}

/** ¿Se puede registrar en `fdi` con su posición en `dentition`? (la API responde 422 si no). */
export function toothFitsDentition(fdi: string, dentition: DentitionType): boolean {
  if (dentition === 'MIXED') return true;
  return isPrimaryFdi(fdi) ? dentition === 'PRIMARY' : dentition === 'PERMANENT';
}

/** Una columna de la carta: la posición y lo que se dibuja en ella. */
export interface ChartColumn {
  position: string;
  /** El permanente, si se dibuja (PERMANENT o MIXED). */
  permanent: string | null;
  /** El temporal, si se dibuja (PRIMARY o MIXED, solo posiciones 1-5). */
  primary: string | null;
  /** Molar en dentición temporal: hueco «sin erupcionar». */
  unerupted: boolean;
}

export interface ArchLayout {
  columns: ChartColumn[];
  /** Si alguna columna de la arcada dibuja un temporal (si no, no hay fila de temporales). */
  hasPrimaryRow: boolean;
}

/**
 * Columnas de una arcada en el orden de la carta (18…11 21…28 arriba,
 * 48…41 31…38 abajo), con lo que cada posición dibuja según su dentición.
 */
export function chartLayoutForArch(
  arch: Arch,
  dentitionOf: (position: string) => DentitionType,
): ArchLayout {
  const positions = arch === 'upper' ? PERMANENT_UPPER : PERMANENT_LOWER;
  const columns = positions.map((position): ChartColumn => {
    const dentition = dentitionOf(position);
    const primary = primaryAtPosition(position);
    return {
      position,
      permanent: dentition === 'PRIMARY' ? null : position,
      primary: dentition === 'PERMANENT' ? null : primary,
      unerupted: dentition === 'PRIMARY' && primary === null,
    };
  });
  return { columns, hasPrimaryRow: columns.some((c) => c.primary !== null) };
}

/**
 * Preajuste del conmutador de la carta entera (una sola petición, una sola
 * dentición): PERMANENTE y TEMPORAL tocan las 32 posiciones; MIXTA, las que
 * tienen temporal (incisivos, caninos y premolares), porque los molares no
 * tienen dentición mixta y se ajustan aparte (erupción).
 */
export function presetPositions(target: DentitionType): string[] {
  return target === 'MIXED' ? ALL_POSITIONS.filter(hasPrimaryPredecessor) : ALL_POSITIONS;
}

/**
 * Las posiciones del preajuste que se envían: las que cambian y, DX-132, las
 * que ya están en esa dentición solo por la edad o por defecto (`isFixed`
 * falso). Pasar la carta entera a una dentición la deja AJUSTADA A MANO: si
 * no se fijaran, la edad las movería más adelante (p. ej. los 17/27 de un
 * niño de 7 años al pasar a temporal) y la carta seguiría «según la edad».
 * Sin `isFixed` solo se envían las que cambian.
 */
export function presetChanges(
  target: DentitionType,
  dentitionOf: (position: string) => DentitionType,
  isFixed: (position: string) => boolean = () => true,
): string[] {
  return presetPositions(target).filter((p) => dentitionOf(p) !== target || !isFixed(p));
}

/** DX-132: de dónde sale la dentición de la carta (`DentitionDto.basis` de la API). */
export type DentitionBasis = 'AGE' | 'DEFAULT' | 'MANUAL';
export type DentitionSource = 'EVENT' | 'AGE' | 'DEFAULT';

/**
 * DX-132: el rótulo junto al conmutador. MANUAL (las 32 posiciones vienen de un
 * evento) → «Ajustada a mano», nunca «Según la edad». Con eventos solo en
 * parte de la boca la API sigue diciendo AGE/DEFAULT: el rótulo lo matiza para
 * no afirmar que toda la carta sale de la edad.
 */
export function dentitionBasisLabel(view: {
  basis: DentitionBasis;
  ageYears: number | null;
  positions: readonly { source: DentitionSource }[];
}): string | null {
  if (view.basis === 'MANUAL') return 'Ajustada a mano';
  const partlyManual = view.positions.some((p) => p.source === 'EVENT');
  if (view.basis === 'AGE' && view.ageYears !== null) {
    return partlyManual
      ? `Ajustada a mano en parte; el resto, por la edad (${view.ageYears} años)`
      : `Según la edad (${view.ageYears} años)`;
  }
  if (view.basis === 'DEFAULT') {
    return partlyManual
      ? 'Ajustada a mano en parte; el resto, permanente por defecto'
      : 'Permanente por defecto (sin fecha de nacimiento)';
  }
  return null;
}
