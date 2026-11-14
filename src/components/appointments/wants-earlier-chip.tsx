import { Badge } from '@/components/ui/badge';

export const WANTS_EARLIER_LABEL = 'Adelantar si hay hueco';
/** DX-437: lo pidió el paciente desde el enlace de confirmación. */
export const REQUESTED_BY_PATIENT_LABEL = 'Pedido por el paciente';

export type EarlierWindow = 'MORNING' | 'AFTERNOON' | 'ANY';

/** DX-437: la franja pedida, en palabras del panel (ANY no añade nada). */
export const EARLIER_WINDOW_LABELS: Record<EarlierWindow, string | null> = {
  MORNING: 'Mañanas',
  AFTERNOON: 'Tardes',
  ANY: null,
};

/** Texto completo del chip: «Adelantar si hay hueco · Pedido por el paciente · Mañanas». */
export function wantsEarlierText(appointment: {
  wantsEarlier?: boolean | null;
  earlierWindow?: EarlierWindow | null;
  earlierRequestedAt?: string | null;
}): string | null {
  if (!appointment.wantsEarlier) return null;
  return [
    WANTS_EARLIER_LABEL,
    appointment.earlierRequestedAt ? REQUESTED_BY_PATIENT_LABEL : null,
    appointment.earlierWindow ? EARLIER_WINDOW_LABELS[appointment.earlierWindow] : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Chip «Adelantar si hay hueco» (DX-210) de la tarjeta de la cita: el paciente
 * quiere venir antes, así que sale como candidato en «Ocupar este hueco». Sin
 * la marca no pinta nada. DX-437: si lo pidió el paciente desde el enlace, lo
 * dice, y la franja que eligió.
 */
export function WantsEarlierChip({
  wantsEarlier,
  earlierWindow = null,
  earlierRequestedAt = null,
  className,
}: {
  wantsEarlier: boolean | undefined;
  earlierWindow?: EarlierWindow | null;
  earlierRequestedAt?: string | null;
  className?: string;
}) {
  const text = wantsEarlierText({ wantsEarlier, earlierWindow, earlierRequestedAt });
  if (!text) return null;
  return (
    // Una marca informativa, no un estado: tono info, nunca el acento de la clínica.
    <Badge variant="info" data-testid="wants-earlier-chip" title={text} className={className}>
      <span className="min-w-0 truncate">{text}</span>
    </Badge>
  );
}
