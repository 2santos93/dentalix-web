import {
  minutesFromMidnight,
  blockGeometry,
  layoutLanes,
  ROW_HEIGHT_PX,
  GRID_HEIGHT_PX,
  MIN_BLOCK_PX,
} from './week-grid-layout';

describe('minutesFromMidnight', () => {
  it('returns local minutes since 00:00', () => {
    // TZ=UTC in tests, so the Z time equals local time.
    expect(minutesFromMidnight('2026-03-09T09:30:00.000Z')).toBe(9 * 60 + 30);
    expect(minutesFromMidnight('2026-03-09T00:00:00.000Z')).toBe(0);
  });
});

describe('blockGeometry', () => {
  it('positions a 30-min block at its start row', () => {
    const g = blockGeometry('2026-03-09T09:00:00.000Z', '2026-03-09T09:30:00.000Z');
    expect(g.topPx).toBe((9 * 60 / 30) * ROW_HEIGHT_PX); // 18 slots * 40 = 720
    expect(g.heightPx).toBe(ROW_HEIGHT_PX); // 30 min = 1 row
  });

  it('enforces a minimum height for zero/negative durations', () => {
    const g = blockGeometry('2026-03-09T09:00:00.000Z', '2026-03-09T09:00:00.000Z');
    expect(g.heightPx).toBe(MIN_BLOCK_PX);
  });

  it('clamps height to the bottom of the grid', () => {
    // Starts at 23:30, "ends" next day — height clamps to remaining grid.
    const g = blockGeometry('2026-03-09T23:30:00.000Z', '2026-03-10T02:00:00.000Z');
    expect(g.topPx).toBe((23 * 60 + 30) / 30 * ROW_HEIGHT_PX);
    expect(g.topPx + g.heightPx).toBeLessThanOrEqual(GRID_HEIGHT_PX);
  });

  it('grid clamp wins over minimum height at end of day', () => {
    // Starts at 23:50, duration 15 min; remaining space (10px) < MIN_BLOCK_PX (20px).
    // Grid clamp must win, so heightPx = 10px and topPx + heightPx = GRID_HEIGHT_PX.
    const g = blockGeometry('2026-03-09T23:50:00.000Z', '2026-03-10T00:05:00.000Z');
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
