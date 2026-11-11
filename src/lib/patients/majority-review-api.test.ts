import { canReviewMajority, civilMonthRange, reachedAge, sortComingOfAge, type ComingOfAgeItem } from './majority-review-api';

const item = (over: Partial<ComingOfAgeItem>): ComingOfAgeItem => ({
  patientId: 'p',
  fullName: 'X',
  patientCode: 'P-1',
  birthDate: '2008-11-01',
  majorityDate: '2026-11-01',
  majorityAge: 18,
  status: 'PENDING',
  overdue: false,
  responsiblesCount: 1,
  ...over,
});

describe('majority-review-api (DX-342)', () => {
  it('civilMonthRange: el mes del día y el siguiente, también al cruzar el año', () => {
    expect(civilMonthRange('2026-11-11')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(civilMonthRange('2026-12-31', 1)).toEqual({ from: '2027-01-01', to: '2027-01-31' });
    expect(civilMonthRange('2028-01-31', 1)).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('sortComingOfAge: las pendientes vencidas primero, luego por fecha', () => {
    const sorted = sortComingOfAge([
      item({ patientId: 'a', majorityDate: '2026-11-02' }),
      item({ patientId: 'b', majorityDate: '2026-09-01', overdue: true }),
      item({ patientId: 'c', majorityDate: '2026-08-01', overdue: true, status: 'REVIEWED' }),
    ]);
    expect(sorted.map((i) => i.patientId)).toEqual(['b', 'c', 'a']);
  });

  it('reachedAge: la de la vista o la diferencia de años', () => {
    expect(reachedAge({ majorityAge: 16, majorityDate: '2026-11-01' }, '2008-11-01')).toBe(16);
    expect(reachedAge({ majorityDate: '2026-11-01' }, '2008-11-01')).toBe(18);
    expect(reachedAge({ majorityDate: null }, '2008-11-01')).toBeNull();
  });

  it('canReviewMajority: ADMIN y RECEPTION', () => {
    expect(canReviewMajority('ADMIN')).toBe(true);
    expect(canReviewMajority('RECEPTION')).toBe(true);
    expect(canReviewMajority('DENTIST')).toBe(false);
    expect(canReviewMajority(null)).toBe(false);
  });
});
