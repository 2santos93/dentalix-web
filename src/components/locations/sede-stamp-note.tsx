import { SedeConfigError } from '@/components/locations/sede-config-error';
import type { SedeStamp } from '@/lib/locations/sede-stamp';

interface SedeStampNoteProps {
  /** El pintor de la pantalla: su `notice` es el aviso de la sede que no tiene formato. */
  stamp: Pick<SedeStamp, 'notice'>;
  className?: string;
}

/**
 * El aviso de UNA sede sin formato para una pantalla con fechas, horas o
 * importes (DX-354b, E4/E7.2): una vez por pantalla, no por fila, con Reintentar
 * y «Configurar sede» solo para ADMIN. La región `role="status"` está montada
 * siempre y vacía; el aviso se rellena después, y así los lectores de pantalla
 * lo anuncian (un `role="status"` que nace relleno no se anuncia de forma fiable).
 */
export function SedeStampNote({ stamp, className }: SedeStampNoteProps) {
  const { notice } = stamp;
  return (
    <div role="status">
      {notice ? (
        <SedeConfigError
          kind={notice.kind}
          variant="note"
          live={false}
          description={notice.message}
          locationId={notice.locationId}
          onRetry={notice.retry}
          className={className}
        />
      ) : null}
    </div>
  );
}
