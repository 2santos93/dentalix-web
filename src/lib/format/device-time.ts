/**
 * DX-574: la hora de un hecho de ESTE equipo (cuándo se guardó un borrador
 * local), no de la clínica: el borrador no sale del navegador, así que su hora
 * es la del reloj y la zona del equipo donde se escribió. Formato `HH:mm` en
 * 24 h con `Intl` (sin getters locales de `Date` ni ceros a mano, ver
 * `hand-composed-time-guard`). Las horas de citas, cobros y demás datos de la
 * clínica siguen saliendo del reloj de la sede (`sedeTime`).
 */
const DEVICE_TIME = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export function deviceTime(epochMs: number): string {
  const d = new Date(epochMs);
  return Number.isNaN(d.getTime()) ? '—' : DEVICE_TIME.format(d);
}
