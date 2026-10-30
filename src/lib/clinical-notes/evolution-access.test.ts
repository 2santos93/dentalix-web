import { canRegisterEvolution } from './evolution-access';
import { wallInstant } from '@/lib/time/wall-clock';

// «Hoy» y las citas, en el reloj de la sede (Caracas, UTC−4); Jest corre con TZ=UTC.
const ZONE = 'America/Caracas';
const today = '2026-10-17';
const at = (day: string, h: number) => wallInstant(day, h * 60, ZONE).toISOString();
const todayAt = (h: number) => at(today, h);
const lastWeek = at('2026-10-10', 9);
const can = (role: Parameters<typeof canRegisterEvolution>[0], start: string, status: string) =>
  canRegisterEvolution(role, { start, status }, today, ZONE);

describe('canRegisterEvolution (DX-170)', () => {
  it('RECEPTION nunca (la API responde 403)', () => {
    expect(can('RECEPTION', todayAt(9), 'COMPLETED')).toBe(false);
    expect(can(null, todayAt(9), 'COMPLETED')).toBe(false);
  });

  it.each(['DENTIST', 'ASSISTANT', 'ADMIN'] as const)('%s: cita atendida de otro día o cita del día', (role) => {
    expect(can(role, lastWeek, 'COMPLETED')).toBe(true);
    expect(can(role, todayAt(16), 'SCHEDULED')).toBe(true);
    expect(can(role, todayAt(8), 'CONFIRMED')).toBe(true);
  });

  it('no en una cita pendiente de otro día, cancelada ni no-show', () => {
    expect(can('DENTIST', lastWeek, 'SCHEDULED')).toBe(false);
    expect(can('DENTIST', todayAt(9), 'CANCELLED')).toBe(false);
    expect(can('DENTIST', todayAt(9), 'NO_SHOW')).toBe(false);
  });

  it('no en una cita de un día futuro aunque esté marcada atendida (la API responde 400)', () => {
    const tomorrow = at('2026-10-18', 9);
    expect(can('DENTIST', tomorrow, 'COMPLETED')).toBe(false);
    expect(can('DENTIST', tomorrow, 'SCHEDULED')).toBe(false);
  });

  it('el día de la cita es el de la sede: las 23:00 de hoy en Caracas ya son mañana en UTC', () => {
    expect(can('DENTIST', todayAt(23), 'SCHEDULED')).toBe(true);
  });
});
