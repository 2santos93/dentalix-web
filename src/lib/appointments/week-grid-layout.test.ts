import {
  minutesFromMidnight,
  blockGeometry,
  layoutLanes,
  ROW_HEIGHT_PX,
  GRID_HEIGHT_PX,
  MIN_BLOCK_PX,
} from './week-grid-layout';

// UTC−4: las horas de pared de abajo son las de Caracas.
const ZONE = 'America/Caracas';
const at = (wall: string) => new Date(new Date(`${wall}Z`).getTime() + 4 * 3600_000).toISOString();

describe('minutesFromMidnight', () => {
  it('returns the minutes since 00:00 on the sede clock, not the browser (TZ=UTC in tests)', () => {
    expect(minutesFromMidnight('2026-03-09T13:30:00.000Z', ZONE)).toBe(9 * 60 + 30);
    expect(minutesFromMidnight('2026-03-09T04:00:00.000Z', ZONE)).toBe(0);
  });
});

describe('blockGeometry', () => {
  it('positions a 30-min block at its start row', () => {
    const g = blockGeometry(at('2026-03-09T09:00:00.000'), at('2026-03-09T09:30:00.000'), ZONE);
    expect(g.topPx).toBe((9 * 60 / 30) * ROW_HEIGHT_PX); // 18 slots * 40 = 720
    expect(g.heightPx).toBe(ROW_HEIGHT_PX); // 30 min = 1 row
  });

  it('enforces a minimum height for zero/negative durations', () => {
    const g = blockGeometry(at('2026-03-09T09:00:00.000'), at('2026-03-09T09:00:00.000'), ZONE);
    expect(g.heightPx).toBe(MIN_BLOCK_PX);
  });

  it('clamps height to the bottom of the grid', () => {
    // Starts at 23:30, "ends" next day — height clamps to remaining grid.
    const g = blockGeometry(at('2026-03-09T23:30:00.000'), at('2026-03-10T02:00:00.000'), ZONE);
    expect(g.topPx).toBe((23 * 60 + 30) / 30 * ROW_HEIGHT_PX);
    expect(g.topPx + g.heightPx).toBeLessThanOrEqual(GRID_HEIGHT_PX);
  });

  it('grid clamp wins over minimum height at end of day', () => {
    // Starts at 23:50, duration 15 min; remaining space (10px) < MIN_BLOCK_PX (20px).
    // Grid clamp must win, so heightPx = 10px and topPx + heightPx = GRID_HEIGHT_PX.
    const g = blockGeometry(at('2026-03-09T23:50:00.000'), at('2026-03-10T00:05:00.000'), ZONE);
    expect(g.topPx + g.heightPx).toBeLessThanOrEqual(GRID_HEIGHT_PX);
    expect(g.heightPx).toBeLessThan(MIN_BLOCK_PX); // Grid clamp forced this below minimum
  });
});

describe('layoutLanes', () => {
  it('gives a single full-width lane when nothing overlaps', () => {
    const out = layoutLanes([
      { id: 'a', start: 0, end: 30 },
      { id: 'b', start: 60, end: 90 },
    ]);
    expect(out.every((x) => x.laneCount === 1 && x.lane === 0)).toBe(true);
  });

  it('splits two overlapping items into 2 lanes', () => {
    const out = layoutLanes([
      { id: 'a', start: 0, end: 60 },
      { id: 'b', start: 30, end: 90 },
    ]);
    expect(out.find((x) => x.id === 'a')).toMatchObject({ lane: 0, laneCount: 2 });
    expect(out.find((x) => x.id === 'b')).toMatchObject({ lane: 1, laneCount: 2 });
  });

  it('keeps separate clusters independent', () => {
    const out = layoutLanes([
      { id: 'a', start: 0, end: 60 },
      { id: 'b', start: 30, end: 90 }, // overlaps a -> cluster of 2
      { id: 'c', start: 120, end: 150 }, // separate -> 1 lane
    ]);
    expect(out.find((x) => x.id === 'c')).toMatchObject({ lane: 0, laneCount: 1 });
    expect(out.find((x) => x.id === 'a')!.laneCount).toBe(2);
  });
});
