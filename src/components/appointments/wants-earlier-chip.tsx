import { cn } from '@/lib/utils';

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
    <span
      data-testid="wants-earlier-chip"
      title={WANTS_EARLIER_LABEL}
      className={cn(
        // Sobre el color del tipo de cita, fondo de superficie: el texto
        // mantiene el contraste en claro y en oscuro.
        'inline-flex max-w-full items-center rounded-full border border-primary/40 bg-surface px-2 py-0.5 text-xs font-medium text-primary',
        className,
      )}
    >
      <span className="min-w-0 truncate">{WANTS_EARLIER_LABEL}</span>
    </span>
  );
}
