import { SedeConfigError } from '@/components/locations/sede-config-error';
import { cn } from '@/lib/utils';
import { getActiveLocationId } from '@/lib/locations/location-store';

interface DocumentFormatNoteProps {
  /**
   * La sede del documento, para que «Configurar sede» abra su modal. Si el
   * documento no trae el id de su sede, la activa: es la que la API usó para
   * armarlo (estado de cuenta, consentimiento, presupuesto…).
   */
  locationId?: string | null;
  /** Vuelve a leer el documento, que trae el formato de su sede con sus valores de hoy. */
  onRetry: () => void;
  /**
   * `false` deja solo la región vacía: quien la monta siempre y la activa
   * cuando el documento llega sin formato consigue que se anuncie. Por defecto
   * `true` (quien la monta ya sabe que falta el formato).
   */
  active?: boolean;
  className?: string;
}

/**
 * Aviso de un documento cuya sede no tiene zona, formato o reloj (DX-354): las
 * fechas e importes del papel salen «—» y esta nota, solo en pantalla
 * (`print:hidden`), dice qué falta. Nunca se pinta otro formato en su lugar.
 */
export function DocumentFormatNote({ locationId, onRetry, active = true, className }: DocumentFormatNoteProps) {
  return (
    // La región `role="status"` es el contenedor y la nota va dentro sin rol propio.
    <div role="status" className={cn('print:hidden', className)}>
      {active ? (
        <SedeConfigError
          kind="locale"
          variant="note"
          live={false}
          locationId={locationId ?? getActiveLocationId()}
          onRetry={onRetry}
        />
      ) : null}
    </div>
  );
}
