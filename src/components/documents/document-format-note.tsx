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
  className?: string;
}

/**
 * Aviso de un documento cuya sede no tiene zona, formato o reloj (DX-354): las
 * fechas e importes del papel salen «—» y esta nota, solo en pantalla
 * (`print:hidden`), dice qué falta. Nunca se pinta otro formato en su lugar.
 */
export function DocumentFormatNote({ locationId, onRetry, className }: DocumentFormatNoteProps) {
  return (
    <div className={cn('print:hidden', className)}>
      <SedeConfigError kind="locale" variant="note" locationId={locationId ?? getActiveLocationId()} onRetry={onRetry} />
    </div>
  );
}
