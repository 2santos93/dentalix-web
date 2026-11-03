import { SedeConfigError } from '@/components/locations/sede-config-error';
import { cn } from '@/lib/utils';

interface DocumentFormatNoteProps {
  /** La sede del documento, para que «Configurar sede» abra su modal. */
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
      <SedeConfigError kind="locale" variant="note" locationId={locationId} onRetry={onRetry} />
    </div>
  );
}
