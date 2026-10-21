import {
  WEEKDAY_ORDER,
  addDaysIso,
  buildSchedulePayload,
  copyDay,
  describeRanges,
  emptyWeek,
  fitsRanges,
  hiddenProviderIds,
  mondayOf,
  outsideBands,
  rosterCell,
  toScheduleDraft,
  validateOverrideRanges,
  type ScheduleDraft,
} from './provider-schedule';

const A = 'loc-a';
const B = 'loc-b';
const names = { [A]: 'Sede A', [B]: 'Sede B' };

function draftWith(entries: Record<string, Record<number, [string, string][]>>): ScheduleDraft {
  const draft: ScheduleDraft = {};
  for (const [loc, days] of Object.entries(entries)) {
    const week = emptyWeek();
    for (const [weekday, ranges] of Object.entries(days)) {
      week[Number(weekday)] = ranges.map(([start, end]) => ({ start, end }));
    }
    draft[loc] = week;
  }
  return draft;
}

describe('toScheduleDraft', () => {
  it('una columna por sede de la clínica, con los tramos de cada día ordenados', () => {
    const draft = toScheduleDraft(
      {
        providerId: 'p1',
        configured: true,
        locations: [
          {
            locationId: A,
            locationName: 'Sede A',
            timeZone: 'America/Bogota',
            ranges: [
              { weekday: 1, startMinute: 15 * 60, endMinute: 18 * 60 },
              { weekday: 1, startMinute: 8 * 60, endMinute: 13 * 60 },
            ],
          },
        ],
      },
      [A, B],
    );
    expect(draft[A][1]).toEqual([
      { start: '08:00', end: '13:00' },
      { start: '15:00', end: '18:00' },
    ]);
    expect(draft[B]).toEqual(emptyWeek());
  });

  it('el fin 1440 (24:00) se edita como 00:00 y vuelve como 1440', () => {
    const draft = toScheduleDraft(
      {
        providerId: 'p1',
        configured: true,
        locations: [
          {
            locationId: A,
            locationName: 'Sede A',
            timeZone: 'UTC',
            ranges: [{ weekday: 2, startMinute: 20 * 60, endMinute: 1440 }],
          },
        ],
      },
      [A],
    );
    expect(draft[A][2]).toEqual([{ start: '20:00', end: '00:00' }]);
    const result = buildSchedulePayload(draft, names);
    expect(result).toEqual({
      ok: true,
      payload: { locations: [{ locationId: A, ranges: [{ weekday: 2, startMinute: 1200, endMinute: 1440 }] }] },
    });
  });
});

describe('buildSchedulePayload', () => {
  it('rotación en dos sedes: lunes y miércoles en A, jueves en B', () => {
    const draft = draftWith({
      [A]: { 1: [['08:00', '13:00']], 3: [['08:00', '13:00']] },
      [B]: { 4: [['14:00', '19:00']] },
    });
    expect(buildSchedulePayload(draft, names)).toEqual({
      ok: true,
      payload: {
        locations: [
          {
            locationId: A,
            ranges: [
              { weekday: 1, startMinute: 480, endMinute: 780 },
              { weekday: 3, startMinute: 480, endMinute: 780 },
            ],
          },
          { locationId: B, ranges: [{ weekday: 4, startMinute: 840, endMinute: 1140 }] },
        ],
      },
    });
  });

  it('las sedes sin tramos no viajan; todo vacío = sin horario', () => {
    expect(buildSchedulePayload(draftWith({ [A]: {}, [B]: {} }), names)).toEqual({
      ok: true,
      payload: { locations: [] },
    });
  });

  it('rechaza un tramo que termina antes de empezar', () => {
    const result = buildSchedulePayload(draftWith({ [A]: { 1: [['13:00', '08:00']] } }), names);
    expect(result).toEqual({ ok: false, message: expect.stringMatching(/Lunes en Sede A/) });
  });

  it('rechaza minutos que no son múltiplos de 5', () => {
    const result = buildSchedulePayload(draftWith({ [A]: { 1: [['08:03', '13:00']] } }), names);
    expect(result).toEqual({ ok: false, message: expect.stringMatching(/5 en 5/) });
  });

  it('rechaza más de 7 tramos por día y sede', () => {
    const ranges: [string, string][] = Array.from({ length: 8 }, (_, i) => [
      `${String(8 + i).padStart(2, '0')}:00`,
      `${String(8 + i).padStart(2, '0')}:30`,
    ]);
    const result = buildSchedulePayload(draftWith({ [A]: { 2: ranges } }), names);
    expect(result).toEqual({ ok: false, message: expect.stringMatching(/7 tramos/) });
  });

  it('rechaza tramos solapados en la misma sede y día (contiguos sí valen)', () => {
    expect(
      buildSchedulePayload(draftWith({ [A]: { 1: [['08:00', '10:00'], ['10:00', '12:00']] } }), names).ok,
    ).toBe(true);
    const result = buildSchedulePayload(
      draftWith({ [A]: { 1: [['08:00', '10:00'], ['09:30', '12:00']] } }),
      names,
    );
    expect(result).toEqual({ ok: false, message: expect.stringMatching(/solapados/) });
  });

  it('rechaza el mismo día solapado en dos sedes, con un mensaje que nombra ambas', () => {
    const result = buildSchedulePayload(
      draftWith({ [A]: { 4: [['08:00', '13:00']] }, [B]: { 4: [['12:00', '19:00']] } }),
      names,
    );
    expect(result).toEqual({
      ok: false,
      message: 'Jueves: el tramo de Sede A se solapa con el de Sede B. Un profesional no puede estar en dos sedes a la vez.',
    });
  });
});

describe('validateOverrideRanges', () => {
  it('sin tramos = «no trabaja» (válido)', () => {
    expect(validateOverrideRanges([])).toEqual({ ok: true, ranges: [] });
  });
  it('convierte y valida como el semanal', () => {
    expect(validateOverrideRanges([{ start: '09:00', end: '12:00' }])).toEqual({
      ok: true,
      ranges: [{ startMinute: 540, endMinute: 720 }],
    });
    expect(validateOverrideRanges([{ start: '12:00', end: '09:00' }]).ok).toBe(false);
  });
});

describe('copyDay', () => {
  it('copia el día en TODAS las sedes a los días elegidos y no toca los demás', () => {
    const draft = draftWith({
      [A]: { 1: [['08:00', '13:00']], 5: [['09:00', '10:00']] },
      [B]: { 1: [], 2: [['14:00', '15:00']] },
    });
    const copied = copyDay(draft, 1, [2, 3]);
    expect(copied[A][2]).toEqual([{ start: '08:00', end: '13:00' }]);
    expect(copied[A][3]).toEqual([{ start: '08:00', end: '13:00' }]);
    expect(copied[B][2]).toEqual([]);
    expect(copied[A][5]).toEqual([{ start: '09:00', end: '10:00' }]);
    // Sin mutar el borrador de partida, ni compartir tramos entre días.
    expect(draft[A][2]).toEqual([]);
    copied[A][2][0].start = '07:00';
    expect(copied[A][3][0].start).toBe('08:00');
  });
});

describe('fechas', () => {
  it('mondayOf: el lunes de la semana (el domingo es el último día)', () => {
    expect(mondayOf('2026-10-22')).toBe('2026-10-19');
    expect(mondayOf('2026-10-25')).toBe('2026-10-19');
    expect(mondayOf('2026-10-19')).toBe('2026-10-19');
  });
  it('addDaysIso cruza meses', () => {
    expect(addDaysIso('2026-10-30', 3)).toBe('2026-11-02');
  });
  it('WEEKDAY_ORDER empieza el lunes', () => {
    expect(WEEKDAY_ORDER).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });
});

describe('describeRanges', () => {
  it('formatea y ordena', () => {
    expect(
      describeRanges([
        { startMinute: 900, endMinute: 1140 },
        { startMinute: 480, endMinute: 780 },
      ]),
    ).toBe('08:00–13:00, 15:00–19:00');
  });
});

describe('rosterCell', () => {
  const base = {
    date: '2026-10-22',
    weekday: 4,
    worksAtLocation: null,
    locationRanges: null,
  };
  it('sin horario: «Sin horario»', () => {
    expect(rosterCell({ ...base, unrestricted: true, assignments: [] }, names)).toEqual([
      { kind: 'unrestricted', text: 'Sin horario' },
    ]);
  });
  it('libre ese día', () => {
    expect(rosterCell({ ...base, unrestricted: false, assignments: [] }, names)).toEqual([
      { kind: 'off', text: 'Libre' },
    ]);
  });
  it('una entrada por sede, con la excepción marcada', () => {
    expect(
      rosterCell(
        {
          ...base,
          unrestricted: false,
          assignments: [
            {
              locationId: B,
              source: 'WEEKLY',
              overrideId: null,
              ranges: [{ startMinute: 840, endMinute: 1140 }],
            },
            { locationId: A, source: 'OVERRIDE', overrideId: 'o1', ranges: [] },
          ],
        },
        names,
      ),
    ).toEqual([
      { kind: 'works', locationId: B, location: 'Sede B', text: '14:00–19:00', override: false },
      { kind: 'override-off', locationId: A, location: 'Sede A', text: 'No trabaja', override: true },
    ]);
  });
});

describe('outsideBands', () => {
  const window = { start: 7 * 60, end: 20 * 60 };
  it('null (sin restricción): nada sombreado', () => {
    expect(outsideBands(null, window)).toEqual([]);
  });
  it('sin tramos (no trabaja allí): toda la franja', () => {
    expect(outsideBands([], window)).toEqual([window]);
  });
  it('el resto del día alrededor de sus tramos', () => {
    expect(
      outsideBands(
        [
          { startMinute: 14 * 60, endMinute: 19 * 60 },
          { startMinute: 8 * 60, endMinute: 13 * 60 },
        ],
        window,
      ),
    ).toEqual([
      { start: 7 * 60, end: 8 * 60 },
      { start: 13 * 60, end: 14 * 60 },
      { start: 19 * 60, end: 20 * 60 },
    ]);
  });
});

describe('fitsRanges', () => {
  it('sin restricción, cabe siempre; con tramos, entera dentro de uno', () => {
    expect(fitsRanges(null, 600, 630)).toBe(true);
    expect(fitsRanges([{ startMinute: 480, endMinute: 780 }], 480, 780)).toBe(true);
    expect(fitsRanges([{ startMinute: 480, endMinute: 780 }], 760, 790)).toBe(false);
    expect(fitsRanges([], 600, 630)).toBe(false);
  });
});

describe('hiddenProviderIds', () => {
  const day = (worksAtLocation: boolean | null) => ({
    date: '2026-10-22',
    weekday: 4,
    unrestricted: false,
    assignments: [],
    worksAtLocation,
    locationRanges: null,
  });
  it('oculta a quien ese día no trabaja en la sede; sin dato (Todas las sedes) no oculta', () => {
    const roster = {
      providers: [
        { providerId: 'p1', fullName: 'X', role: 'DENTIST' as const, configured: true, days: [day(true)] },
        { providerId: 'p2', fullName: 'Y', role: 'DENTIST' as const, configured: true, days: [day(false)] },
        { providerId: 'p3', fullName: 'Z', role: 'DENTIST' as const, configured: false, days: [day(null)] },
      ],
    };
    expect(hiddenProviderIds(roster, '2026-10-22')).toEqual(new Set(['p2']));
    expect(hiddenProviderIds(null, '2026-10-22')).toEqual(new Set());
  });
});
