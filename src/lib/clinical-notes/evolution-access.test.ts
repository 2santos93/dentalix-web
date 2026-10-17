import { canRegisterEvolution, localDayOf } from './evolution-access';

const today = '2026-10-17';
const todayAt = (h: number) => new Date(2026, 9, 17, h).toISOString();
const lastWeek = new Date(2026, 9, 10, 9).toISOString();

describe('canRegisterEvolution (DX-170)', () => {
  it('RECEPTION nunca (la API responde 403)', () => {
    expect(canRegisterEvolution('RECEPTION', { start: todayAt(9), status: 'COMPLETED' }, today)).toBe(
      false,
    );
    expect(canRegisterEvolution(null, { start: todayAt(9), status: 'COMPLETED' }, today)).toBe(false);
  });

  it.each(['DENTIST', 'ASSISTANT', 'ADMIN'] as const)('%s: cita atendida de otro día o cita del día', (role) => {
    expect(canRegisterEvolution(role, { start: lastWeek, status: 'COMPLETED' }, today)).toBe(true);
    expect(canRegisterEvolution(role, { start: todayAt(16), status: 'SCHEDULED' }, today)).toBe(true);
    expect(canRegisterEvolution(role, { start: todayAt(8), status: 'CONFIRMED' }, today)).toBe(true);
  });

  it('no en una cita pendiente de otro día, cancelada ni no-show', () => {
    expect(canRegisterEvolution('DENTIST', { start: lastWeek, status: 'SCHEDULED' }, today)).toBe(false);
    expect(canRegisterEvolution('DENTIST', { start: todayAt(9), status: 'CANCELLED' }, today)).toBe(false);
    expect(canRegisterEvolution('DENTIST', { start: todayAt(9), status: 'NO_SHOW' }, today)).toBe(false);
  });

  it('localDayOf usa el día local', () => {
    expect(localDayOf(todayAt(23))).toBe(today);
  });
});
