import { NO_SEDE_FORMAT } from '@/lib/format/sede-number';

/** Lo que oye un lector de pantalla en lugar de la raya (el guion se oculta). */
export const MISSING_VALUE_LABEL = 'Sin dato';

/**
 * El «—» de un dato que no se puede escribir (la sede no tiene formato o aún
 * carga), con texto para lectores de pantalla (DX-354b, E7.1): la raya sola se
 * anuncia como «guion» o no se anuncia. La causa la explica el aviso de la
 * sede, no esta pieza.
 */
export function MissingValue() {
  return (
    <>
      <span aria-hidden>{NO_SEDE_FORMAT}</span>
      <span className="sr-only">{MISSING_VALUE_LABEL}</span>
    </>
  );
}
