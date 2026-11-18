/**
 * DX-137: cierre de sesión por inactividad, configurable por clínica
 * (`sessionIdleMinutes` de `GET /me`, 15–240, 60 por defecto).
 *
 * La última actividad se guarda en `localStorage`, compartida por las pestañas
 * del mismo host (la cookie de sesión también lo es): usar la agenda en una
 * pestaña mantiene viva la sesión de la otra, y una pestaña olvidada no cierra
 * la que se está usando antes de tiempo. Si el almacenamiento falla (modo
 * privado estricto), cada pestaña cuenta la suya en memoria.
 */

export const LAST_ACTIVITY_KEY = 'dentalix:last-activity';
/** `/login?motivo=inactividad`: el login dice «Sesión cerrada por inactividad». */
export const LOGOUT_REASON_PARAM = 'motivo';
export const IDLE_LOGOUT_REASON = 'inactividad';
export const IDLE_LOGIN_PATH = `/login?${LOGOUT_REASON_PARAM}=${IDLE_LOGOUT_REASON}`;
/** Aviso de un cierre por inactividad que hizo el SERVIDOR (refresh 401 `SESSION_IDLE`). */
const PENDING_REASON_KEY = 'dentalix:logout-reason';

export const DEFAULT_IDLE_MINUTES = 60;
/** Cada cuánto se mira el reloj (y al volver a la pestaña). */
export const IDLE_CHECK_INTERVAL_MS = 15_000;
/** Como mucho una escritura de actividad cada esto: el ratón no escribe en cada píxel. */
export const ACTIVITY_WRITE_THROTTLE_MS = 5_000;

/** Lo que cuenta como actividad: tocar, teclear, desplazar. Mover el ratón no. */
export const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

let memoryLastActivity = 0;

export function readLastActivity(): number {
  try {
    const raw = window.localStorage.getItem(LAST_ACTIVITY_KEY);
    const value = raw === null ? NaN : Number(raw);
    if (Number.isFinite(value)) return Math.max(value, memoryLastActivity);
  } catch {
    // Sin almacenamiento: solo la de esta pestaña.
  }
  return memoryLastActivity;
}

export function writeLastActivity(at: number): void {
  memoryLastActivity = Math.max(memoryLastActivity, at);
  try {
    const current = Number(window.localStorage.getItem(LAST_ACTIVITY_KEY));
    // Nunca hacia atrás: otra pestaña pudo apuntar una actividad más reciente.
    if (!Number.isFinite(current) || current < at) {
      window.localStorage.setItem(LAST_ACTIVITY_KEY, String(at));
    }
  } catch {
    // Sin almacenamiento: queda la de memoria.
  }
}

export function forgetLastActivity(): void {
  memoryLastActivity = 0;
  try {
    window.localStorage.removeItem(LAST_ACTIVITY_KEY);
  } catch {
    // nada que borrar
  }
}

/** ¿Pasaron más de `idleMinutes` desde la última actividad? */
export function isIdle(lastActivity: number, now: number, idleMinutes: number): boolean {
  if (!(lastActivity > 0)) return false;
  return now - lastActivity >= idleMinutes * 60_000;
}

/** Minutos válidos de la clínica, o el valor por defecto. */
export function idleMinutesOrDefault(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 15 && value <= 240
    ? value
    : DEFAULT_IDLE_MINUTES;
}

/** El refresh devolvió `SESSION_IDLE`: el próximo /login lo dirá. */
export function rememberIdleLogout(): void {
  try {
    window.sessionStorage.setItem(PENDING_REASON_KEY, IDLE_LOGOUT_REASON);
  } catch {
    // sin aviso: el login sale sin mensaje
  }
}

/** ¿Hay un cierre por inactividad pendiente de avisar? Lo consume. */
export function takeIdleLogout(): boolean {
  try {
    const pending = window.sessionStorage.getItem(PENDING_REASON_KEY) === IDLE_LOGOUT_REASON;
    window.sessionStorage.removeItem(PENDING_REASON_KEY);
    return pending;
  } catch {
    return false;
  }
}
