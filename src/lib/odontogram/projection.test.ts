import { projectOdontogram } from './projection';
import type { ToothGroup, ToothRecord } from './odontogram-api';

function record(overrides: Partial<ToothRecord> & { id: string }): ToothRecord {
  return {
    toothNumber: '11',
    surfaces: [],
    kind: 'DIAGNOSIS',
    status: 'PLANNED',
    recordedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('projectOdontogram', () => {
  it('returns an empty map for empty groups', () => {
    const result = projectOdontogram([]);
    expect(result.size).toBe(0);
  });

  it('a group with no records has no surface/whole-tooth state (healthy)', () => {
    const groups: ToothGroup[] = [{ toothNumber: '11', records: [] }];
    const result = projectOdontogram(groups);
    const state = result.get('11');
    expect(state).toBeDefined();
    expect(state?.hasRecords).toBe(false);
    expect(state?.wholeToothRecord).toBeNull();
    expect(Object.keys(state?.surfaceState ?? {})).toHaveLength(0);
  });

  it('per-surface: latest record wins over an earlier one on the same surface', () => {
    const older = record({
      id: 'r1',
      surfaces: ['OCCLUSAL'],
      recordedAt: '2026-01-01T00:00:00.000Z',
      notes: 'old',
    });
    const newer = record({
      id: 'r2',
      surfaces: ['OCCLUSAL'],
      recordedAt: '2026-02-01T00:00:00.000Z',
      notes: 'new',
    });
    // records arrive ASC by recordedAt, per backend contract
    const groups: ToothGroup[] = [{ toothNumber: '11', records: [older, newer] }];
    const result = projectOdontogram(groups);
    const state = result.get('11');
    expect(state?.hasRecords).toBe(true);
    expect(state?.surfaceState.OCCLUSAL?.id).toBe('r2');
  });

  it('a record with no surfaces is a whole-tooth record; latest wins', () => {
    const older = record({ id: 'w1', surfaces: [], recordedAt: '2026-01-01T00:00:00.000Z' });
    const newer = record({ id: 'w2', surfaces: [], recordedAt: '2026-03-01T00:00:00.000Z' });
    const groups: ToothGroup[] = [{ toothNumber: '21', records: [older, newer] }];
    const result = projectOdontogram(groups);
    const state = result.get('21');
    expect(state?.wholeToothRecord?.id).toBe('w2');
  });

  it('surfaces and whole-tooth records are tracked independently', () => {
    const surfaceRec = record({
      id: 's1',
      surfaces: ['MESIAL', 'DISTAL'],
      recordedAt: '2026-01-01T00:00:00.000Z',
    });
    const wholeRec = record({ id: 'w1', surfaces: [], recordedAt: '2026-01-02T00:00:00.000Z' });
    const groups: ToothGroup[] = [{ toothNumber: '16', records: [surfaceRec, wholeRec] }];
    const result = projectOdontogram(groups);
    const state = result.get('16');
    expect(state?.surfaceState.MESIAL?.id).toBe('s1');
    expect(state?.surfaceState.DISTAL?.id).toBe('s1');
    expect(state?.wholeToothRecord?.id).toBe('w1');
  });

  it('resolves color from the most recent relevant record via catalogById', () => {
    const rec = record({
      id: 'c1',
      surfaces: [],
      catalogItemId: 'cat-1',
      recordedAt: '2026-01-01T00:00:00.000Z',
    });
    const groups: ToothGroup[] = [{ toothNumber: '11', records: [rec] }];
    const catalogById = new Map([['cat-1', { color: '#FF0000' }]]);
    const result = projectOdontogram(groups, catalogById);
    expect(result.get('11')?.color).toBe('#FF0000');
  });

  it('color is null when no catalog map is given', () => {
    const rec = record({ id: 'c1', surfaces: [], catalogItemId: 'cat-1' });
    const groups: ToothGroup[] = [{ toothNumber: '11', records: [rec] }];
    const result = projectOdontogram(groups);
    expect(result.get('11')?.color).toBeNull();
  });

  it('color is null when the record has no catalogItemId', () => {
    const rec = record({ id: 'c1', surfaces: [] });
    const groups: ToothGroup[] = [{ toothNumber: '11', records: [rec] }];
    const catalogById = new Map([['cat-1', { color: '#FF0000' }]]);
    const result = projectOdontogram(groups, catalogById);
    expect(result.get('11')?.color).toBeNull();
  });

  it('color is recency-based: a newer surface record beats an older whole-tooth record', () => {
    const olderWholeTooth = record({
      id: 'w1',
      surfaces: [],
      catalogItemId: 'cat-a',
      recordedAt: '2026-01-01T00:00:00.000Z',
    });
    const newerSurface = record({
      id: 's1',
      surfaces: ['OCCLUSAL'],
      catalogItemId: 'cat-b',
      recordedAt: '2026-02-01T00:00:00.000Z',
    });
    // ASC by recordedAt, per backend contract
    const groups: ToothGroup[] = [{ toothNumber: '11', records: [olderWholeTooth, newerSurface] }];
    const catalogById = new Map([
      ['cat-a', { color: '#AAAAAA' }],
      ['cat-b', { color: '#BBBBBB' }],
    ]);
    const result = projectOdontogram(groups, catalogById);
    expect(result.get('11')?.color).toBe('#BBBBBB');
  });

  it('color is recency-based: a newer whole-tooth record beats an older surface record', () => {
    const olderSurface = record({
      id: 's1',
      surfaces: ['OCCLUSAL'],
      catalogItemId: 'cat-a',
      recordedAt: '2026-01-01T00:00:00.000Z',
    });
    const newerWholeTooth = record({
      id: 'w1',
      surfaces: [],
      catalogItemId: 'cat-b',
      recordedAt: '2026-02-01T00:00:00.000Z',
    });
    // ASC by recordedAt, per backend contract
    const groups: ToothGroup[] = [{ toothNumber: '11', records: [olderSurface, newerWholeTooth] }];
    const catalogById = new Map([
      ['cat-a', { color: '#AAAAAA' }],
      ['cat-b', { color: '#BBBBBB' }],
    ]);
    const result = projectOdontogram(groups, catalogById);
    expect(result.get('11')?.color).toBe('#BBBBBB');
  });

  it('records list on the tooth state preserves the input records', () => {
    const rec = record({ id: 'r1' });
    const groups: ToothGroup[] = [{ toothNumber: '11', records: [rec] }];
    const result = projectOdontogram(groups);
    expect(result.get('11')?.records).toEqual([rec]);
  });
});
