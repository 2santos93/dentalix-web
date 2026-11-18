import {
  DEFAULT_IDLE_MINUTES,
  IDLE_LOGIN_PATH,
  LAST_ACTIVITY_KEY,
  forgetLastActivity,
  idleMinutesOrDefault,
  isIdle,
  readLastActivity,
  rememberIdleLogout,
  takeIdleLogout,
  writeLastActivity,
} from './idle-logout';

describe('cierre por inactividad (DX-137)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    forgetLastActivity();
  });

  it('vence exactamente a los minutos de la clínica', () => {
    const t0 = 1_000_000;
    expect(isIdle(t0, t0 + 15 * 60_000 - 1, 15)).toBe(false);
    expect(isIdle(t0, t0 + 15 * 60_000, 15)).toBe(true);
    // Sin actividad registrada no se cierra nada.
    expect(isIdle(0, t0, 15)).toBe(false);
  });

  it('la actividad se comparte entre pestañas y nunca retrocede', () => {
    writeLastActivity(5_000);
    expect(window.localStorage.getItem(LAST_ACTIVITY_KEY)).toBe('5000');
    // Otra pestaña apuntó algo más reciente.
    window.localStorage.setItem(LAST_ACTIVITY_KEY, '9000');
    writeLastActivity(6_000);
    expect(readLastActivity()).toBe(9_000);
  });

  it('minutos fuera de 15–240 o ausentes → 60', () => {
    expect(idleMinutesOrDefault(30)).toBe(30);
    expect(idleMinutesOrDefault(10)).toBe(DEFAULT_IDLE_MINUTES);
    expect(idleMinutesOrDefault(undefined)).toBe(DEFAULT_IDLE_MINUTES);
    expect(idleMinutesOrDefault(30.5)).toBe(DEFAULT_IDLE_MINUTES);
  });

  it('el aviso pendiente se consume una vez y lleva al login con motivo', () => {
    expect(takeIdleLogout()).toBe(false);
    rememberIdleLogout();
    expect(takeIdleLogout()).toBe(true);
    expect(takeIdleLogout()).toBe(false);
    expect(IDLE_LOGIN_PATH).toBe('/login?motivo=inactividad');
  });
});
