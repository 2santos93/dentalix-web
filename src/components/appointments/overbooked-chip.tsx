import { Badge } from '@/components/ui/badge';

export const OVERBOOKED_LABEL = 'Sobrecupo';

/**
 * DX-509: distintivo «Sobrecupo» de una urgencia atendida sin hueco (DX-470)
 * en la agenda. Solo mientras lo es: al moverla, o al deshacer la llegada o
 * reactivarla con su hora libre, la API la vuelve normal y el chip se va.
 * Una cancelada o no-show no ocupa nada: tampoco lo pinta.
 */
export function OverbookedChip({
  overbooked,
  status,
  className,
}: {
  overbooked: boolean | undefined;
  status: string;
  className?: string;
}) {
  if (!overbooked || status === 'CANCELLED' || status === 'NO_SHOW') return null;
  return (
    // Una marca que pide atención (no un estado): el tono de aviso, como en «En clínica».
    <Badge variant="warning" data-testid="overbooked-chip" title={OVERBOOKED_LABEL} className={className}>
      <span className="min-w-0 truncate">{OVERBOOKED_LABEL}</span>
    </Badge>
  );
}

/** ¿Pinta la agenda el distintivo de esta cita? */
export function showsOverbooked(a: { overbooked?: boolean; status: string }): boolean {
  return Boolean(a.overbooked) && a.status !== 'CANCELLED' && a.status !== 'NO_SHOW';
}
