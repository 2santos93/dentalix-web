import {
  SCHEDULE_BLOCK_KIND_LABELS,
  blockBandForDay,
  blockLabel,
  blockShownInColumn,
  type ScheduleBlockLike,
} from './schedule-blocks';
import { wallInstant } from '@/lib/time/wall-clock';

const DAY = '2031-03-04'; // martes
// Reloj de la sede (UTC−4); Jest corre con TZ=UTC, así que el navegador marcaría otra hora.
const ZONE = 'America/Caracas';
const local = (day: string, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return wallInstant(day, h * 60 + m, ZONE).toISOString();
};

function block(overrides: Partial<ScheduleBlockLike> = {}): ScheduleBlockLike {
  return {
    id: 'b1',
    providerId: 'prov-1',
    locationId: null,
    start: local(DAY, '13:00'),
    end: local(DAY, '14:00'),
    kind: 'LUNCH',
    allowsBooking: true,
    note: null,
    ...overrides,
  };
}

describe('schedule-blocks (DX-122)', () => {
  it('etiquetas en español por tipo', () => {
    expect(SCHEDULE_BLOCK_KIND_LABELS).toEqual({
      VACATION: 'Vacaciones',
      MEETING: 'Reunión',
      LUNCH: 'Almuerzo',
      OTHER: 'Bloqueo',
    });
  });

  describe('qué columna lo pinta', () => {
    it('el del profesional, en su columna (en todas las sedes o en la activa)', () => {
      expect(blockShownInColumn(block(), 'prov-1', 'loc-a')).toBe(true);
      expect(blockShownInColumn(block(), 'prov-2', 'loc-a')).toBe(false);
      expect(blockShownInColumn(block({ locationId: 'loc-b' }), 'prov-1', 'loc-a')).toBe(false);
      // Vista consolidada: se pinta, venga de la sede que venga.
      expect(blockShownInColumn(block({ locationId: 'loc-b' }), 'prov-1', null)).toBe(true);
    });
    it('el de toda la sede, en todas las columnas de esa sede', () => {
      const sede = block({ providerId: null, locationId: 'loc-a' });
      expect(blockShownInColumn(sede, 'prov-2', 'loc-a')).toBe(true);
      expect(blockShownInColumn(sede, 'prov-2', 'loc-b')).toBe(false);
      expect(blockShownInColumn(sede, 'prov-2', null)).toBe(true);
    });
  });

  describe('banda de un día', () => {
    const window = { start: 7 * 60, end: 20 * 60 };
    it('las horas del bloqueo ese día, en minutos locales', () => {
      expect(blockBandForDay(block(), DAY, window, ZONE)).toEqual({ start: 13 * 60, end: 14 * 60 });
    });
    it('un bloqueo de varios días cubre el día entero (recortado a la franja)', () => {
      const vacation = block({ start: local('2031-03-03', '00:00'), end: local('2031-03-08', '00:00') });
      expect(blockBandForDay(vacation, DAY, window, ZONE)).toEqual(window);
    });
    it('el primer y el último día, recortados', () => {
      const spanning = block({ start: local(DAY, '18:00'), end: local('2031-03-05', '10:00') });
      expect(blockBandForDay(spanning, DAY, window, ZONE)).toEqual({ start: 18 * 60, end: 20 * 60 });
      expect(blockBandForDay(spanning, '2031-03-05', window, ZONE)).toEqual({ start: 7 * 60, end: 10 * 60 });
    });
    it('null si no toca ese día o queda fuera de la franja', () => {
      expect(blockBandForDay(block(), '2031-03-05', window, ZONE)).toBeNull();
      expect(
        blockBandForDay(block({ start: local(DAY, '05:00'), end: local(DAY, '06:00') }), DAY, window, ZONE),
      ).toBeNull();
    });
  });

  it('la etiqueta dice el tipo, la nota, quién y si deja agendar', () => {
    expect(blockLabel(block())).toBe('Almuerzo · se puede agendar');
    expect(
      blockLabel(block({ kind: 'VACATION', allowsBooking: false, note: 'Congreso' }), 'Dra. Ana Ríos'),
    ).toBe('Vacaciones: Congreso · Dra. Ana Ríos');
    expect(blockLabel(block({ providerId: null, locationId: 'loc', kind: 'MEETING', allowsBooking: false }))).toBe(
      'Reunión · toda la sede',
    );
  });
});
