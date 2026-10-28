import { regionalFormat } from '@/lib/format/regional-format';
import type { LocationHoliday } from './location-calendar-api';
import {
  canManageLocationCalendar,
  civilWeekday,
  describeWorkingWeekdays,
  groupHolidays,
  importCopy,
  ISO_WEEK_ORDER,
  recurringLabel,
} from './location-calendar';

/** Sede con formato `en-US`/`h12`: las palabras siguen saliendo en UI_LANGUAGE. */
const fmt = regionalFormat({ locale: 'en-US', hourCycle: 'h12' });

function holiday(id: string, date: string, recurring: boolean, name = `Festivo de prueba ${id}`): LocationHoliday {
  return { id, date, name, recurring };
}

describe('ISO_WEEK_ORDER', () => {
  it('runs Monday to Sunday (R12)', () => {
    expect(ISO_WEEK_ORDER).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });
});

describe('describeWorkingWeekdays', () => {
  it.each([
    [[1, 2, 3, 4, 5], 'Lunes a viernes'],
    [[0, 1, 2, 3, 4], 'Domingo a jueves'],
    [[5, 6, 0, 1], 'Viernes a lunes'],
    [[1, 3, 5], 'Lunes, miércoles y viernes'],
    [[2, 4], 'Martes y jueves'],
    [[0, 1, 2, 3, 4, 5, 6], 'Todos los días'],
    [[3], 'Miércoles'],
  ])('%j → %s', (days, expected) => {
    expect(describeWorkingWeekdays(days, fmt)).toBe(expected);
  });

  it('does not depend on the order or on repeats', () => {
    expect(describeWorkingWeekdays([5, 4, 3, 2, 1, 1], fmt)).toBe('Lunes a viernes');
    expect(describeWorkingWeekdays([4, 2], fmt)).toBe('Martes y jueves');
  });

  it('two adjacent days are a list, not a span', () => {
    expect(describeWorkingWeekdays([1, 2], fmt)).toBe('Lunes y martes');
  });

  it('the words do not change with the location format', () => {
    const other = regionalFormat({ locale: 'de-DE', hourCycle: 'h23' });
    expect(describeWorkingWeekdays([1, 2, 3, 4, 5], other)).toBe('Lunes a viernes');
  });

  it('an empty week or a day out of 0–6 throws', () => {
    expect(() => describeWorkingWeekdays([], fmt)).toThrow(RangeError);
    expect(() => describeWorkingWeekdays([1, 7], fmt)).toThrow(RangeError);
  });
});

describe('recurringLabel', () => {
  it('is day and month without the stored year', () => {
    expect(recurringLabel('2020-05-03', fmt)).toBe('3 de mayo');
  });
});

describe('civilWeekday', () => {
  it('0 = domingo, like the API', () => {
    expect(civilWeekday('2027-05-02')).toBe(0);
    expect(civilWeekday('2027-05-03')).toBe(1);
  });

  it('rejects a day that does not exist', () => {
    expect(() => civilWeekday('2027-02-30')).toThrow(RangeError);
    expect(() => civilWeekday('03/05/2027')).toThrow(RangeError);
  });
});

describe('labels do not depend on the process zone', () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it('labels do not depend on the process zone', () => {
    process.env.TZ = 'America/Los_Angeles';
    expect(recurringLabel('2027-05-03', fmt)).toBe('3 de mayo');
    expect(fmt.weekdayName(civilWeekday('2027-05-03'))).toBe('lunes');
  });
});

describe('importCopy', () => {
  it('has a singular for n = 1 and the plural otherwise', () => {
    expect(importCopy.newRows(1, fmt)).toBe('1 nuevo');
    expect(importCopy.newRows(12, fmt)).toBe('12 nuevos');
    expect(importCopy.duplicateRows(1, fmt)).toBe('1 ya existía');
    expect(importCopy.duplicateRows(12, fmt)).toBe('12 ya existían');
    expect(importCopy.errorRows(1, fmt)).toBe('1 con error');
    expect(importCopy.errorRows(12, fmt)).toBe('12 con errores');
    expect(importCopy.importButton(1, fmt)).toBe('Importar 1 festivo');
    expect(importCopy.importButton(12, fmt)).toBe('Importar 12 festivos');
    expect(importCopy.imported(1, fmt)).toBe('Importado 1 festivo');
    expect(importCopy.imported(12, fmt)).toBe('Importados 12 festivos');
  });

  it('numbers come from the location format', () => {
    expect(importCopy.newRows(1000, regionalFormat({ locale: 'de-DE', hourCycle: 'h23' }))).toBe('1.000 nuevos');
    expect(importCopy.newRows(1000, fmt)).toBe('1,000 nuevos');
  });

  it('joins the parts with « · »', () => {
    expect(importCopy.separator).toBe(' · ');
  });
});

describe('groupHolidays', () => {
  it('recurring by month and day, one-off by ascending year and date', () => {
    const groups = groupHolidays([
      holiday('a', '2028-01-10', false),
      holiday('b', '2020-12-25', true),
      holiday('c', '2027-05-03', false),
      holiday('d', '2024-05-01', true),
      holiday('e', '2027-01-02', false),
      holiday('f', '2019-01-01', true),
    ]);
    expect(groups.recurring.map((h) => h.id)).toEqual(['f', 'd', 'b']);
    expect(groups.years).toEqual([
      { year: 2027, items: [expect.objectContaining({ id: 'e' }), expect.objectContaining({ id: 'c' })] },
      { year: 2028, items: [expect.objectContaining({ id: 'a' })] },
    ]);
  });

  it('an empty list has no groups', () => {
    expect(groupHolidays([])).toEqual({ recurring: [], years: [] });
  });

  it('does not reorder the input', () => {
    const input = [holiday('a', '2028-01-10', false), holiday('b', '2027-01-10', false)];
    groupHolidays(input);
    expect(input.map((h) => h.id)).toEqual(['a', 'b']);
  });
});

describe('canManageLocationCalendar', () => {
  it('only ADMIN (R9)', () => {
    expect(canManageLocationCalendar('ADMIN')).toBe(true);
    for (const role of ['DENTIST', 'ASSISTANT', 'RECEPTION', null] as const) {
      expect(canManageLocationCalendar(role)).toBe(false);
    }
  });
});
