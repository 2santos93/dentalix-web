import {
  presetChanges,
  chartLayoutForArch,
  positionOfTooth,
  primaryAtPosition,
  toothFitsDentition,
  isPrimaryFdi,
} from './dentition';

describe('dentición en la carta (DX-120)', () => {
  it('un temporal ocupa la posición de su sucesor permanente', () => {
    expect(positionOfTooth('55')).toBe('15');
    expect(positionOfTooth('64')).toBe('24');
    expect(positionOfTooth('36')).toBe('36');
    expect(primaryAtPosition('15')).toBe('55');
    expect(primaryAtPosition('31')).toBe('71');
    expect(primaryAtPosition('16')).toBeNull();
    expect(isPrimaryFdi('85')).toBe(true);
    expect(isPrimaryFdi('48')).toBe(false);
  });

  it('el diente cabe según la dentición de su posición', () => {
    expect(toothFitsDentition('55', 'PRIMARY')).toBe(true);
    expect(toothFitsDentition('55', 'PERMANENT')).toBe(false);
    expect(toothFitsDentition('15', 'PRIMARY')).toBe(false);
    expect(toothFitsDentition('16', 'PRIMARY')).toBe(false);
    expect(toothFitsDentition('55', 'MIXED')).toBe(true);
    expect(toothFitsDentition('15', 'MIXED')).toBe(true);
  });

  it('una arcada en permanente no tiene fila de temporales', () => {
    const layout = chartLayoutForArch('upper', () => 'PERMANENT');
    expect(layout.hasPrimaryRow).toBe(false);
    expect(layout.columns.map((c) => c.permanent)).toEqual([
      '18', '17', '16', '15', '14', '13', '12', '11',
      '21', '22', '23', '24', '25', '26', '27', '28',
    ]);
    expect(layout.columns.every((c) => c.primary === null && !c.unerupted)).toBe(true);
  });

  it('en temporal dibuja 51-55/61-65 y deja los molares sin erupcionar', () => {
    const layout = chartLayoutForArch('upper', () => 'PRIMARY');
    expect(layout.hasPrimaryRow).toBe(true);
    const col15 = layout.columns.find((c) => c.position === '15');
    const col16 = layout.columns.find((c) => c.position === '16');
    expect(col15).toMatchObject({ permanent: null, primary: '55', unerupted: false });
    expect(col16).toMatchObject({ permanent: null, primary: null, unerupted: true });
  });

  it('en mixta dibuja los dos dientes de la posición', () => {
    const layout = chartLayoutForArch('lower', (p) => (p === '31' ? 'MIXED' : 'PERMANENT'));
    expect(layout.hasPrimaryRow).toBe(true);
    expect(layout.columns.find((c) => c.position === '31')).toMatchObject({
      permanent: '31',
      primary: '71',
    });
    expect(layout.columns.map((c) => c.position).slice(0, 3)).toEqual(['48', '47', '46']);
  });

  it('los preajustes de la carta solo tocan lo que cambia', () => {
    expect(presetChanges('PERMANENT', () => 'MIXED')).toHaveLength(32);
    expect(presetChanges('PERMANENT', () => 'PERMANENT')).toEqual([]);
    const mixed = presetChanges('MIXED', () => 'PRIMARY');
    expect(mixed).toHaveLength(20);
    expect(mixed).toContain('11');
    expect(mixed).not.toContain('16');
  });
});
