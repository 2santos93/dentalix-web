import { zoneOffsetMinutes } from '@/lib/time/wall-clock';

/**
 * «GMT−4», «GMT+5:30», «GMT» (I1): el desfase de la zona en el instante dado,
 * con signo menos tipográfico. Mínimo local de Inicio hasta que la
 * configuración regional exponga el suyo; `null` si la zona no existe.
 */
export function gmtOffsetLabel(timeZone: string, at: Date = new Date()): string | null {
  let minutes: number;
  try {
    minutes = zoneOffsetMinutes(at, timeZone);
  } catch {
    return null;
  }
  if (!Number.isFinite(minutes)) return null;
  if (minutes === 0) return 'GMT';
  const sign = minutes > 0 ? '+' : '−';
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const rest = abs % 60;
  return `GMT${sign}${hours}${rest ? `:${String(rest).padStart(2, '0')}` : ''}`;
}

/** «Hora de Sede Norte (GMT−4)»: la zona dicha por la sede que la define, no por una ciudad suelta. */
export function sedeTimeLabel(sedeName: string, timeZone: string, at: Date = new Date()): string {
  const offset = gmtOffsetLabel(timeZone, at);
  return offset ? `Hora de ${sedeName} (${offset})` : `Hora de ${sedeName}`;
}
