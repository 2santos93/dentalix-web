import type { RegionalFormat } from '@/lib/format/regional-format';
import { NO_SEDE_FORMAT } from '@/lib/format/sede-number';

/**
 * Índice periodontal en porcentaje («12,5 %», «12.5%») con el formato de la
 * sede. Sin formato (cargando o sede sin configurar), «—»: nunca otro formato.
 */
export function perioPercent(value: number, fmt: RegionalFormat | null): string {
  return fmt ? fmt.percent(value) : NO_SEDE_FORMAT;
}
