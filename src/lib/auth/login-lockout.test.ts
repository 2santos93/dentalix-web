import { loginLockedMessage, waitClock } from './login-lockout';

describe('loginLockedMessage (DX-048)', () => {
  it.each([
    [1, 1],
    [59, 1],
    [60, 1],
    [61, 2],
    [120, 2],
    [900, 15],
  ])('%i s → «en %i min» (redondea hacia arriba, nunca 0)', (seconds, minutes) => {
    expect(loginLockedMessage(seconds)).toBe(
      `Demasiados intentos. Vuelve a intentarlo en ${minutes} min.`,
    );
  });
});

describe('waitClock', () => {
  it.each([
    [0, '0:00'],
    [5, '0:05'],
    [60, '1:00'],
    [125, '2:05'],
    [900, '15:00'],
  ])('%i s → %s', (seconds, clock) => {
    expect(waitClock(seconds)).toBe(clock);
  });
});
