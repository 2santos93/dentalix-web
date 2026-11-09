import { cn } from '@/lib/utils';
import type { SedePainters } from '@/lib/locations/sede-stamp';
import { StatusBadge } from '@/components/ui/status-badge';

export const quoteValidityCopy = {
  expired: (date: string) => `Vencido el ${date}`,
  validUntil: (date: string) => `Válido hasta el ${date}`,
};

interface QuoteValidityProps {
  /** Último día válido (`YYYY-MM-DD`, inclusive); `null` en planes sin validez guardada. */
  validUntil: string | null | undefined;
  /** Lo decide el servidor con el día de la sede (`quoteExpired`): aquí no se recalcula. */
  expired: boolean;
  /** La sede del dato (la de la presentación): con su formato sale el día. */
  locationId?: string | null;
  stamp: SedePainters;
  /**
   * `true` en una celda de móvil de `DataList`: sin formato de la sede no se
   * pinta nada (una celda de móvil se omite, nunca «—»).
   */
  omitWithoutFormat?: boolean;
  className?: string;
}

/**
 * La validez del presupuesto (DX-379): chip «Vencido el …» (tono del mapa,
 * `quoteValidity`) o una línea secundaria «Válido hasta el …». Sin fechas
 * guardadas (planes anteriores), nada. El día sale con el formato de la sede
 * del dato; sin formato, «—» (la fecha es el sujeto de la frase).
 */
export function QuoteValidity({
  validUntil,
  expired,
  locationId,
  stamp,
  omitWithoutFormat = false,
  className,
}: QuoteValidityProps) {
  if (!validUntil) return null;
  const day = omitWithoutFormat ? stamp.maybe.civilDate(validUntil, locationId) : stamp.civilDate(validUntil, locationId);
  if (day === null) return null;
  if (expired) {
    return (
      <StatusBadge kind="quoteValidity" status="EXPIRED" data-testid="quote-expired" className={className}>
        {quoteValidityCopy.expired(day)}
      </StatusBadge>
    );
  }
  return (
    <span data-testid="quote-valid-until" className={cn('text-sm text-muted tabular-nums', className)}>
      {quoteValidityCopy.validUntil(day)}
    </span>
  );
}
