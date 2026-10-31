/**
 * «Origen» de un registro (auditoría, accesos de soporte) en palabras: el
 * navegador y el sistema que dice el User-Agent («Chrome · macOS») y la IP,
 * con la del propio servidor contada como «Este equipo». Un User-Agent crudo
 * (`Mozilla/5.0 (Macintosh; Intel Mac OS X …`) o `::1` no le dicen nada a la
 * administración de una clínica; el texto completo sigue disponible aparte.
 */

const copy = {
  local: 'Este equipo (local)',
  noIp: 'Sin IP',
  unknownDevice: 'Dispositivo desconocido',
};

// El orden importa: Edge y Opera también dicen «Chrome»; Chrome dice «Safari».
const BROWSERS: readonly [RegExp, string][] = [
  [/\bEdg(?:e|A|iOS)?\//, 'Edge'],
  [/\bOPR\/|\bOpera\b/, 'Opera'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\bFirefox\/|\bFxiOS\//, 'Firefox'],
  [/\bChrome\/|\bCriOS\/|\bChromium\//, 'Chrome'],
  [/\bVersion\/[\d.]+.*\bSafari\//, 'Safari'],
  [/\bcurl\//i, 'curl'],
];

const SYSTEMS: readonly [RegExp, string][] = [
  [/\biPhone\b/, 'iPhone'],
  [/\biPad\b/, 'iPad'],
  [/\bAndroid\b/, 'Android'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bWindows\b/, 'Windows'],
  [/\bMac OS X\b|\bMacintosh\b/, 'macOS'],
  [/\bLinux\b/, 'Linux'],
];

function first(table: readonly [RegExp, string][], ua: string): string | null {
  return table.find(([pattern]) => pattern.test(ua))?.[1] ?? null;
}

/** «Chrome · macOS», «Safari · iPhone», solo una de las dos, o `null` si no se reconoce nada. */
export function deviceLabel(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  const parts = [first(BROWSERS, userAgent), first(SYSTEMS, userAgent)].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** La IP de la propia máquina (loopback, también en su forma IPv6 mapeada). */
export function isLoopback(ip: string): boolean {
  const value = ip.trim().toLowerCase();
  return value === '::1' || value === 'localhost' || /^(?:::ffff:)?127\.\d+\.\d+\.\d+$/.test(value);
}

/** La IP para leer: «Este equipo (local)» para el loopback, «Sin IP» si no hay. */
export function ipLabel(ip: string | null | undefined): string {
  if (!ip) return copy.noIp;
  return isLoopback(ip) ? copy.local : ip;
}

export interface OriginLabel {
  /** «Chrome · macOS», o «Dispositivo desconocido» si el User-Agent no dice nada legible. */
  device: string | null;
  ip: string;
  /** El User-Agent completo, para el tooltip. */
  userAgent: string | null;
}

export function originLabel(ip: string | null | undefined, userAgent: string | null | undefined): OriginLabel {
  return {
    device: userAgent ? (deviceLabel(userAgent) ?? copy.unknownDevice) : null,
    ip: ipLabel(ip),
    userAgent: userAgent || null,
  };
}
