/** Minutos por fila de la rejilla (media hora). */
export const SLOT_MINUTES = 30;
/** Alto en px de cada fila de 30 min. */
export const ROW_HEIGHT_PX = 40;
export const DAY_MINUTES = 24 * 60;
/** Alto total de la rejilla (48 filas). */
export const GRID_HEIGHT_PX = (DAY_MINUTES / SLOT_MINUTES) * ROW_HEIGHT_PX;
/** Alto mínimo de un bloque para que sea clickeable (media fila). */
export const MIN_BLOCK_PX = ROW_HEIGHT_PX / 2;

/** Minutos locales transcurridos desde 00:00 del instante `iso`. */
export function minutesFromMidnight(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * Geometría vertical de un bloque de cita: `topPx` desde el inicio de la
 * rejilla y `heightPx` proporcional a la duración. Duraciones no positivas
 * (dato inválido) usan `MIN_BLOCK_PX`; el alto se recorta al fondo de la
 * rejilla (una cita que cruza medianoche se ve hasta las 24:00).
 */
export function blockGeometry(
  startIso: string,
  endIso: string,
): { topPx: number; heightPx: number } {
  const startMin = minutesFromMidnight(startIso);
  const durationMin = Math.round(
    (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000,
  );
  const topPx = (startMin / SLOT_MINUTES) * ROW_HEIGHT_PX;
  const rawHeight = (durationMin / SLOT_MINUTES) * ROW_HEIGHT_PX;
  const maxHeight = GRID_HEIGHT_PX - topPx;
  const heightPx = Math.max(MIN_BLOCK_PX, Math.min(rawHeight, maxHeight));
  return { topPx, heightPx };
}

export interface Interval {
  start: number;
  end: number;
}

/**
 * Reparte intervalos que se solapan en carriles (sub-columnas) lado a lado.
 * Agrupa en "clusters" de intervalos conectados por solape; dentro de cada
 * cluster asigna a cada intervalo el primer carril libre (greedy por hora de
 * inicio) y anota `laneCount` = número de carriles que usó ese cluster.
 */
export function layoutLanes<T extends Interval>(
  items: T[],
): Array<T & { lane: number; laneCount: number }> {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);
  const result: Array<T & { lane: number; laneCount: number }> = [];
  let cluster: T[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (cluster.length === 0) return;
    const laneEnds: number[] = []; // fin del último intervalo por carril
    const assigned = cluster.map((it) => {
      let lane = laneEnds.findIndex((end) => end <= it.start);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(it.end);
      } else {
        laneEnds[lane] = it.end;
      }
      return { it, lane };
    });
    const laneCount = laneEnds.length;
    for (const { it, lane } of assigned) result.push({ ...it, lane, laneCount });
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const it of sorted) {
    if (cluster.length > 0 && it.start >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  flush();
  return result;
}
