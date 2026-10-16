import {
  GRID_SNAP_MINUTES,
  PX_PER_MINUTE,
  closedBands,
  gridWindow,
  minuteFromOffset,
  moveTarget,
  offsetFromMinute,
} from './day-grid';
import type { BusinessHours } from '@/lib/locations/schedule-api';

// Lunes 9–13 y 15–19 (convención Date.getDay(): 1 = lunes).
const hours: BusinessHours = {
  timezone: 'America/Bogota',
  ranges: [
    { weekday: 1, startMinute: 9 * 60, endMinute: 13 * 60 },
    { weekday: 1, startMinute: 15 * 60, endMinute: 19 * 60 },
  ],
};

describe('day-grid (DX-121)', () => {
  describe('gridWindow', () => {
    it('abarca el horario del día con media hora de margen', () => {
      expect(gridWindow(hours, 1, [])).toEqual({ start: 8 * 60 + 30, end: 19 * 60 + 30 });
    });

    it('sin horario (o día cerrado) muestra 07:00–20:00', () => {
      expect(gridWindow(null, 1, [])).toEqual({ start: 7 * 60, end: 20 * 60 });
      expect(gridWindow(hours, 0, [])).toEqual({ start: 7 * 60, end: 20 * 60 });
    });

    it('se estira para que ninguna cita quede fuera de la rejilla', () => {
      expect(gridWindow(hours, 1, [{ start: 6 * 60 + 10, end: 21 * 60 }])).toEqual({
        start: 6 * 60,
        end: 21 * 60,
      });
    });
  });

  describe('closedBands', () => {
    it('sombrea antes, entre y después de los tramos', () => {
      expect(closedBands(hours, 1, { start: 8 * 60, end: 20 * 60 })).toEqual([
        { start: 8 * 60, end: 9 * 60 },
        { start: 13 * 60, end: 15 * 60 },
        { start: 19 * 60, end: 20 * 60 },
      ]);
    });

    it('un día cerrado se sombrea entero; sin horario, nada', () => {
      expect(closedBands(hours, 0, { start: 7 * 60, end: 20 * 60 })).toEqual([
        { start: 7 * 60, end: 20 * 60 },
      ]);
      expect(closedBands(null, 1, { start: 7 * 60, end: 20 * 60 })).toEqual([]);
    });
  });

  describe('posición ⇄ hora', () => {
    const window = { start: 8 * 60, end: 20 * 60 };

    it('la hora se convierte en desplazamiento y vuelve', () => {
      const y = offsetFromMinute(10 * 60 + 30, window);
      expect(y).toBe(150 * PX_PER_MINUTE);
      expect(minuteFromOffset(y, window)).toBe(10 * 60 + 30);
    });

    it(`ajusta a la rejilla de ${GRID_SNAP_MINUTES} min y no se sale de la ventana`, () => {
      expect(minuteFromOffset(offsetFromMinute(10 * 60 + 7, window), window)).toBe(10 * 60 + 5);
      expect(minuteFromOffset(offsetFromMinute(10 * 60 + 8, window), window)).toBe(10 * 60 + 10);
      expect(minuteFromOffset(-500, window)).toBe(8 * 60);
      expect(minuteFromOffset(1e6, window)).toBe(20 * 60 - GRID_SNAP_MINUTES);
    });
  });

  describe('moveTarget', () => {
    it('conserva la duración y cambia día, hora y profesional', () => {
      const appointment = {
        start: new Date('2031-03-03T09:00:00').toISOString(),
        end: new Date('2031-03-03T10:30:00').toISOString(),
      };
      expect(moveTarget(appointment, '2031-03-04', 15 * 60, 'prov-2')).toEqual({
        start: new Date('2031-03-04T15:00:00').toISOString(),
        end: new Date('2031-03-04T16:30:00').toISOString(),
        providerId: 'prov-2',
      });
    });
  });
});
