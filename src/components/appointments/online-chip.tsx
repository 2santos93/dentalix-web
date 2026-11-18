import { Badge } from '@/components/ui/badge';

export const ONLINE_LABEL = 'Online';

/**
 * DX-016: marca «Online» de una cita que el paciente reservó desde la página
 * pública (`origin === 'ONLINE'`). Una procedencia, no un estado: tono neutro,
 * nunca el acento de la clínica.
 */
export function OnlineChip({ origin, className }: { origin: string | null | undefined; className?: string }) {
  if (origin !== 'ONLINE') return null;
  return (
    <Badge variant="neutral" data-testid="online-chip" title="Reservada online por el paciente" className={className}>
      <span className="min-w-0 truncate">{ONLINE_LABEL}</span>
    </Badge>
  );
}
