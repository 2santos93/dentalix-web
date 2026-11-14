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
  withAbsentTeeth,
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

describe('moveFocus (DX-403: recorrido en S)', () => {
  const at = (arch: CellRef['arch'], row: CellRef['row'], index: number): CellRef => ({
    arch,
    row,
    measure: 'probing',
    index,
  });
  const name = (ref: CellRef | null) => {
    if (!ref) return null;
    const cell = cellsInRow(ref.arch, ref.row)[ref.index];
    return `${cell.toothFdi} ${cell.site}`;
  };

  it('avanza al siguiente sitio y salta de diente', () => {
    expect(moveFocus(at('upper', 'buccal', 2), 'next')).toEqual(at('upper', 'buccal', 3));
  });

  it('el recorrido completo: 18→28 vest., 28→18 palatino, 48→38 lingual, 38→48 vest.', () => {
    const visited: string[] = [];
    let ref: CellRef | null = at('upper', 'buccal', 0);
    while (ref) {
      visited.push(name(ref)!);
      ref = moveFocus(ref, 'next');
    }
    expect(visited).toHaveLength(192);
    expect(new Set(visited).size).toBe(192);
    // Cambio de cara en el 28: del 28 vestibular distal al 28 palatino distal.
    expect(visited.slice(45, 51)).toEqual(['28 MB', '28 B', '28 DB', '28 DL', '28 L', '28 ML']);
    // Cambio de arcada: del 18 palatino al 48 lingual.
    expect(visited.slice(93, 99)).toEqual(['18 ML', '18 L', '18 DL', '48 DL', '48 L', '48 ML']);
    // Cambio de cara en el 38: del 38 lingual al 38 vestibular.
    expect(visited.slice(141, 147)).toEqual(['38 ML', '38 L', '38 DL', '38 DB', '38 B', '38 MB']);
    expect(visited[191]).toBe('48 DB');
  });

  it('tras el 28 vestibular va al 28 palatino, no al 18 (el fallo de antes)', () => {
    expect(name(moveFocus(at('upper', 'buccal', 47), 'next'))).toBe('28 DL');
  });

  it('`prev` deshace el recorrido, también entre arcadas; los extremos no tienen a dónde ir', () => {
    expect(name(moveFocus(at('lower', 'lingual', 0), 'prev'))).toBe('18 DL');
    expect(moveFocus(at('upper', 'buccal', 0), 'prev')).toBeNull();
    expect(moveFocus(at('lower', 'buccal', 0), 'next')).toBeNull();
  });

  it('conserva la medida (la recesión sigue el mismo recorrido)', () => {
    const from: CellRef = { ...at('upper', 'buccal', 47), measure: 'recession' };
    expect(moveFocus(from, 'next')).toEqual({ ...at('upper', 'lingual', 47), measure: 'recession' });
  });

  it('salta los dientes omitidos, también al cambiar de arcada', () => {
    const skipped = new Set([18, 48]);
    const isSkipped = (fdi: number) => skipped.has(fdi);
    // Del 17 palatino (último antes del 18) al 47 lingual.
    expect(name(moveFocus(at('upper', 'lingual', 3), 'next', isSkipped))).toBe('47 DL');
    // Arriba, del 17 vestibular hacia atrás no queda nada: el 18 está omitido.
    expect(moveFocus(at('upper', 'buccal', 3), 'prev', isSkipped)).toBeNull();
  });

  it('flechas: izquierda/derecha en la fila en pantalla, sin saltar de fila', () => {
    const from = at('upper', 'lingual', 10);
    expect(moveFocus(from, 'right')).toEqual(at('upper', 'lingual', 11));
    expect(moveFocus(from, 'left')).toEqual(at('upper', 'lingual', 9));
    expect(moveFocus(at('upper', 'buccal', 47), 'right')).toBeNull();
    expect(moveFocus(at('upper', 'buccal', 0), 'left')).toBeNull();
    // Los omitidos se cruzan.
    expect(moveFocus(at('upper', 'buccal', 3), 'left', (f) => f === 18)).toBeNull();
    expect(moveFocus(at('upper', 'buccal', 6), 'left', (f) => f === 17)).toEqual(at('upper', 'buccal', 2));
  });

  it('flechas: arriba/abajo en la misma columna, cruzando de arcada', () => {
    const from = at('upper', 'lingual', 0);
    expect(moveFocus(from, 'up')).toEqual(at('upper', 'buccal', 0));
    expect(moveFocus(from, 'down')).toEqual(at('lower', 'buccal', 0));
    expect(moveFocus(at('lower', 'buccal', 0), 'down')).toEqual(at('lower', 'lingual', 0));
    expect(moveFocus(at('lower', 'lingual', 0), 'down')).toBeNull();
    expect(moveFocus(at('upper', 'buccal', 0), 'up')).toBeNull();
  });
});

describe('withAbsentTeeth (DX-403)', () => {
  it('omite por defecto los ausentes de los que el examen no dice nada', () => {
    const draft = emptyDraft();
    const { draft: shown, implied } = withAbsentTeeth(draft, new Set([28, 18]));
    expect(implied).toEqual([18, 28]);
    expect(shown.teeth.get(18)).toEqual({ mobility: null, skipped: true });
    // El borrador original no se toca.
    expect(draft.teeth.size).toBe(0);
  });

  it('respeta «Incluir el 18» (fila con skipped: false) y los dientes ya sondados', () => {
    const draft = emptyDraft();
    draft.teeth.set(18, { mobility: null, skipped: false });
    draft.sites.set('28:B', {
      probingMm: 3,
      recessionMm: null,
      furcation: null,
      bleeding: false,
      suppuration: false,
      plaque: false,
      calculus: false,
    });
    const result = withAbsentTeeth(draft, new Set([18, 28, 38]));
    expect(result.implied).toEqual([38]);
    expect(result.draft.teeth.get(18)?.skipped).toBe(false);
    expect(result.draft.teeth.get(28)).toBeUndefined();
  });

  it('sin ausentes devuelve el mismo borrador', () => {
    const draft = emptyDraft();
    expect(withAbsentTeeth(draft, new Set()).draft).toBe(draft);
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
