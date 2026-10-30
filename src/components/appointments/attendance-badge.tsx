import { CalendarX2 } from 'lucide-react';
import { attendanceBadgeText, type PatientIncidentCounts } from '@/lib/cancellations/cancellation';
import { cn } from '@/lib/utils';

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
  /** En la tarjeta de la agenda: una línea, sin icono, sobre la superficie. */
  compact?: boolean;
}) {
  const text = attendanceBadgeText(counts);
  if (!text) return null;
  return (
    <span
      data-testid="attendance-badge"
      title={text}
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums',
        // Sobre el color del tipo de cita, superficie y texto de aviso (AA); con
        // el fondo teñido, texto en tinta (el tono de aviso no llega a 4,5:1).
        compact ? 'border border-warning/40 bg-surface text-warning-text' : 'bg-warning-subtle text-ink',
        className,
      )}
    >
      {compact ? null : <CalendarX2 aria-hidden className="size-3.5 shrink-0 text-warning-text" />}
      <span className="min-w-0 truncate">{text}</span>
    </span>
  );
}
