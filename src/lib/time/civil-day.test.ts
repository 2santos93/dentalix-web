import { civilNoonUtc, civilWeekday } from './civil-day';

describe('civilNoonUtc', () => {
  it('is noon UTC of the civil day', () => {
    expect(civilNoonUtc('2027-05-03').toISOString()).toBe('2027-05-03T12:00:00.000Z');
  });

  it.each(['2027-02-30', '2027-5-3', '03/05/2027', ''])('%j throws', (day) => {
    expect(() => civilNoonUtc(day)).toThrow(RangeError);
  });
});

describe('civilWeekday', () => {
  it('0 = domingo, like the API', () => {
    expect(civilWeekday('2027-05-02')).toBe(0);
    expect(civilWeekday('2027-05-03')).toBe(1);
    expect(civilWeekday('2027-05-08')).toBe(6);
  });

  it('rejects a day that does not exist', () => {
    expect(() => civilWeekday('2027-02-30')).toThrow(RangeError);
    expect(() => civilWeekday('03/05/2027')).toThrow(RangeError);
  });
});
