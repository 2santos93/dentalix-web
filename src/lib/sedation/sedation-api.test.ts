import { bodyMassIndex, liveOverdue, parseNumber, reversalDoses } from './sedation-api';

describe('sedation-api (DX-407)', () => {
  it('parseNumber: coma o punto, decimales y rango; vacío = undefined', () => {
    expect(parseNumber('18,5', { min: 0.1, max: 399, decimals: 1 })).toBe(18.5);
    expect(parseNumber('18.55', { min: 0.1, max: 399, decimals: 1 })).toBeNull();
    expect(parseNumber('  ', { min: 0, max: 10 })).toBeUndefined();
    expect(parseNumber('11', { min: 0, max: 10 })).toBeNull();
    expect(parseNumber('9,5', { min: 0, max: 10 })).toBeNull();
  });

  it('IMC y reversores como los calcula el servidor', () => {
    expect(bodyMassIndex(15, 100)).toBe(15);
    expect(bodyMassIndex(null, 100)).toBeNull();
    expect(reversalDoses(18.5)).toEqual({ naloxoneMg: 1.85, flumazenilMg: 0.185 });
    expect(reversalDoses(70)).toEqual({ naloxoneMg: 2, flumazenilMg: 0.2 });
  });

  it('liveOverdue recalcula el aviso con el reloj del navegador', () => {
    const watch = {
      intervalMinutes: 5,
      active: true,
      startedAt: null,
      lastTakenAt: null,
      nextDueAt: '2026-10-30T15:05:00.000Z',
      overdue: false,
      overdueMinutes: 0,
      missedIntervals: 0,
    };
    expect(liveOverdue(watch, new Date('2026-10-30T15:04:00.000Z')).overdue).toBe(false);
    expect(liveOverdue(watch, new Date('2026-10-30T15:08:30.000Z'))).toEqual({ overdue: true, overdueMinutes: 3 });
    expect(liveOverdue({ ...watch, active: false }, new Date('2026-10-30T16:00:00.000Z')).overdue).toBe(false);
  });
});
