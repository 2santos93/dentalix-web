import { Badge } from '@/components/ui/badge';

export const WANTS_EARLIER_LABEL = 'Adelantar si hay hueco';

/**
 * Chip «Adelantar si hay hueco» (DX-210) de la tarjeta de la cita: el paciente
 * quiere venir antes, así que sale como candidato en «Ocupar este hueco». Sin
 * la marca no pinta nada.
 */
export function WantsEarlierChip({
  wantsEarlier,
  className,
}: {
  wantsEarlier: boolean | undefined;
  className?: string;
}) {
  if (!wantsEarlier) return null;
  return (
    // Una marca informativa, no un estado: tono info, nunca el acento de la clínica.
    <Badge variant="info" data-testid="wants-earlier-chip" title={WANTS_EARLIER_LABEL} className={className}>
      <span className="min-w-0 truncate">{WANTS_EARLIER_LABEL}</span>
    </Badge>
  );
}
