import {
  LOWER_TEETH,
  UPPER_TEETH,
  applyKey,
  calFor,
  computeDraftIndices,
  probingTrend,
  cellsInRow,
  emptyDraft,
  draftFromExam,
  isUpperTooth,
  lingualLabel,
  moveFocus,
  probingTone,
  sitesForRow,
  toSavePayload,
  type CellRef,
} from './perio-grid';
import type { PerioExamDetail } from './perio-api';

describe('arcadas y sitios', () => {
  it('superior 18→28 e inferior 48→38, en orden de lectura del clínico', () => {
    expect(UPPER_TEETH).toEqual([18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28]);
    expect(LOWER_TEETH).toEqual([48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38]);
  });

  it('superiores (cuadrantes 1 y 2) rotulan la cara lingual como «P» (palatino)', () => {
    expect(isUpperTooth(16)).toBe(true);
    expect(isUpperTooth(36)).toBe(false);
    expect(lingualLabel(true)).toBe('Palatino');
    expect(lingualLabel(false)).toBe('Lingual');
  });

  it('los sitios van de distal a mesial hacia la línea media', () => {
    // Lado derecho del paciente (izquierda del gráfico): distal primero.
    expect(sitesForRow(16, 'buccal')).toEqual(['DB', 'B', 'MB']);
    expect(sitesForRow(26, 'buccal')).toEqual(['MB', 'B', 'DB']);
    expect(sitesForRow(46, 'lingual')).toEqual(['DL', 'L', 'ML']);
    expect(sitesForRow(36, 'lingual')).toEqual(['ML', 'L', 'DL']);
  });

  it('una fila tiene 16 dientes x 3 sitios', () => {
    expect(cellsInRow('upper', 'buccal')).toHaveLength(48);
  });
});

describe('probingTone', () => {
  it('≥4 mm en peligro (rojo), el resto normal', () => {
    expect(probingTone(4)).toBe('danger');
    expect(probingTone(7)).toBe('danger');
    expect(probingTone(3)).toBe('normal');
    expect(probingTone(null)).toBe('normal');
  });
});

describe('calFor', () => {
  it('NIC = sondaje + recesión (recesión vacía cuenta como 0)', () => {
    expect(calFor({ probingMm: 4, recessionMm: 2 })).toBe(6);
    expect(calFor({ probingMm: 4, recessionMm: -1 })).toBe(3);
    expect(calFor({ probingMm: 3, recessionMm: null })).toBe(3);
    expect(calFor({ probingMm: null, recessionMm: 2 })).toBeNull();
  });
});

describe('applyKey (captura rápida)', () => {
  it('un dígito fija el valor y avanza', () => {
    expect(applyKey('5', null, '')).toEqual({
      value: 5,
      advance: true,
      pending: '',
    });
  });
  it('«-» queda pendiente y el dígito siguiente es negativo', () => {
    expect(applyKey('-', 2, '')).toEqual({
      value: 2,
      advance: false,
      pending: '-',
    });
    expect(applyKey('2', 2, '-')).toEqual({
      value: -2,
      advance: true,
      pending: '',
    });
  });
  it('«-» solo admite hasta -5 (rango de recesión): -6..-9 se ignoran', () => {
    expect(applyKey('5', 1, '-')).toEqual({ value: -5, advance: true, pending: '' });
    expect(applyKey('6', 1, '-')).toEqual({ value: 1, advance: false, pending: '' });
    expect(applyKey('9', null, '-')).toEqual({ value: null, advance: false, pending: '' });
  });
  it('«+» suma 10 al dígito siguiente (10–19 mm)', () => {
    expect(applyKey('+', null, '')).toEqual({
      value: null,
      advance: false,
      pending: '+',
    });
    expect(applyKey('2', null, '+')).toEqual({
      value: 12,
      advance: true,
      pending: '',
    });
  });
  it('Retroceso o Supr limpia sin avanzar', () => {
    expect(applyKey('Backspace', 4, '')).toEqual({
      value: null,
      advance: false,
      pending: '',
    });
    expect(applyKey('Delete', 4, '')).toEqual({
      value: null,
      advance: false,
      pending: '',
    });
  });
  it('otras teclas no hacen nada', () => {
    expect(applyKey('a', 4, '')).toBeNull();
  });
});

describe('moveFocus', () => {
  const rows: CellRef['row'][] = ['buccal', 'lingual'];
  it('avanza al siguiente sitio y salta de diente', () => {
    const from: CellRef = {
      arch: 'upper',
      row: 'buccal',
      measure: 'probing',
      index: 2,
    };
    expect(moveFocus(from, 'next', rows)).toEqual({ ...from, index: 3 });
  });
  it('al final de la fila pasa a la siguiente fila', () => {
    const from: CellRef = {
      arch: 'upper',
      row: 'buccal',
      measure: 'probing',
      index: 47,
    };
    expect(moveFocus(from, 'next', rows)).toEqual({
      ...from,
      row: 'lingual',
      index: 0,
    });
  });
  it('flechas: izquierda/derecha en la fila, arriba/abajo cambian de fila', () => {
    const from: CellRef = {
      arch: 'upper',
      row: 'lingual',
      measure: 'probing',
      index: 0,
    };
    expect(moveFocus(from, 'prev', rows)).toEqual({
      ...from,
      row: 'buccal',
      index: 47,
    });
    expect(moveFocus(from, 'up', rows)).toEqual({ ...from, row: 'buccal' });
    expect(moveFocus({ ...from, row: 'buccal' }, 'down', rows)).toEqual(from);
    expect(moveFocus(from, 'down', rows)).toBeNull();
  });
});

describe('borrador y payload', () => {
  const exam = {
    sites: [
      {
        toothFdi: 16,
        site: 'MB',
        probingMm: 5,
        recessionMm: 1,
        calMm: 6,
        furcation: null,
        bleeding: true,
        suppuration: false,
        plaque: false,
        calculus: false,
      },
    ],
    teeth: [{ toothFdi: 18, mobility: null, skipped: true }],
  } as unknown as PerioExamDetail;

  it('carga el examen en el borrador', () => {
    const draft = draftFromExam(exam);
    expect(draft.sites.get('16:MB')).toMatchObject({
      probingMm: 5,
      bleeding: true,
    });
    expect(draft.teeth.get(18)).toEqual({ mobility: null, skipped: true });
  });

  it('solo envía los sitios y dientes tocados', () => {
    const draft = emptyDraft();
    draft.sites.set('11:B', {
      probingMm: 3,
      recessionMm: null,
      furcation: null,
      bleeding: false,
      suppuration: false,
      plaque: true,
      calculus: false,
    });
    draft.teeth.set(11, { mobility: 1, skipped: false });
    const payload = toSavePayload(draft, new Set(['11:B', '12:MB']), new Set([11]));
    expect(payload.sites).toEqual([
      {
        toothFdi: 11,
        site: 'B',
        probingMm: 3,
        recessionMm: null,
        furcation: null,
        bleeding: false,
        suppuration: false,
        plaque: true,
        calculus: false,
      },
      // Tocado y vacío: se limpia en el servidor.
      {
        toothFdi: 12,
        site: 'MB',
        probingMm: null,
        recessionMm: null,
        furcation: null,
        bleeding: false,
        suppuration: false,
        plaque: false,
        calculus: false,
      },
    ]);
    expect(payload.teeth).toEqual([{ toothFdi: 11, mobility: 1, skipped: false }]);
  });
});

describe('computeDraftIndices', () => {
  it('calcula BOP%, placa% y ≥4/≥6 sin los dientes omitidos', () => {
    const draft = emptyDraft();
    const base = {
      probingMm: null,
      recessionMm: null,
      furcation: null,
      bleeding: false,
      suppuration: false,
      plaque: false,
      calculus: false,
    };
    draft.sites.set('16:MB', { ...base, probingMm: 6, bleeding: true });
    draft.sites.set('16:B', { ...base, probingMm: 4, plaque: true });
    draft.sites.set('11:B', { ...base, probingMm: 2 });
    draft.sites.set('11:MB', base);
    draft.sites.set('18:MB', { ...base, probingMm: 8, bleeding: true });
    draft.teeth.set(18, { mobility: null, skipped: true });
    expect(computeDraftIndices(draft)).toEqual({
      sitesExamined: 3,
      bopPercent: 33.3,
      plaquePercent: 33.3,
      sites4mmOrMore: 2,
      sites6mmOrMore: 1,
    });
  });
});

describe('probingTrend', () => {
  it('menos sondaje es mejora; más, empeora', () => {
    expect(probingTrend(3, 5)).toBe('better');
    expect(probingTrend(6, 4)).toBe('worse');
    expect(probingTrend(4, 4)).toBe('same');
    expect(probingTrend(null, 4)).toBeNull();
  });
});
