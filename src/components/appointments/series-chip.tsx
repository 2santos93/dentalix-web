import { Badge } from '@/components/ui/badge';
import { seriesLabel, type AppointmentSeriesRef } from '@/lib/appointments/appointment-series-api';

/**
 * DX-562: marca «Serie · 3 de 6» de una cita creada con «Repetir». Una
 * procedencia, no un estado: tono neutro, nunca el acento de la clínica.
 */
export function SeriesChip({ series, className }: { series: AppointmentSeriesRef | null | undefined; className?: string }) {
  if (!series) return null;
  return (
    <Badge variant="neutral" data-testid="series-chip" className={className}>
      <span className="min-w-0 truncate tabular-nums">{seriesLabel(series)}</span>
    </Badge>
  );
}
