import { regionalFormat, type RegionalFormat } from '@/lib/format/regional-format';
import type { PrescriptionLocationFormat } from './prescriptions-api';

export interface PrescriptionFormat {
  fmt: RegionalFormat;
  timeZone: string;
}

/**
 * Formato del A4 (DX-324, spec R11 y §6.3): el de la sede de la receta, con sus
 * valores actuales, tal como los devuelve `GET /prescriptions/:id`. No es la
 * sede activa (`useSedeFormat`). `null` si falta el locale, el reloj o la zona,
 * o si este navegador no sabe formatear con ellos, también con una zona
 * guardada inválida (pre-flight M16). Nunca otro formato en su lugar: quien
 * imprime pinta «—» y `SedeConfigError`.
 */
export function prescriptionFormat(
  loc: PrescriptionLocationFormat | null | undefined,
): PrescriptionFormat | null {
  const locale = loc?.locale;
  const hourCycle = loc?.hourCycle;
  const timeZone = loc?.timeZone;
  if (!locale || !hourCycle || !timeZone) return null;
  try {
    const fmt = regionalFormat({ locale, hourCycle });
    fmt.date(new Date(0), timeZone);
    return { fmt, timeZone };
  } catch (e) {
    if (e instanceof RangeError) return null;
    throw e;
  }
}
