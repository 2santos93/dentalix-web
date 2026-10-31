import { CalendarX2 } from 'lucide-react';
import { attendanceBadgeText, type PatientIncidentCounts } from '@/lib/cancellations/cancellation';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

/**
 * Insignia «2 inasistencias · 1 cancelación tardía (12 meses)» (DX-279) de la
 * cabecera de la ficha y de la tarjeta y el detalle de la cita. La API cuenta
 * solo las sedes permitidas al usuario (DX-089) y nunca las cancelaciones de la
 * clínica. Sin incidencias no pinta nada.
 */
export function AttendanceBadge({
  counts,
  className,
  compact = false,
}: {
  counts: PatientIncidentCounts | null | undefined;
  className?: string;
  /** En la tarjeta de la agenda: una línea, sin icono. */
  compact?: boolean;
}) {
  const text = attendanceBadgeText(counts);
  if (!text) return null;
  return (
    // Un solo aspecto (DESIGN.md → Status tones): tinte de aviso con texto de aviso (AA en claro y oscuro).
    <Badge variant="warning" data-testid="attendance-badge" title={text} className={cn('tabular-nums', className)}>
      {compact ? null : <CalendarX2 aria-hidden className="size-3.5 shrink-0" />}
      <span className="min-w-0 truncate">{text}</span>
    </Badge>
  );
}
