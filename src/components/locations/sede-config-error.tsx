import { FieldError } from '@/components/errors/field-error';
import { SectionError } from '@/components/errors/section-error';
import { SEDE_TIME_ZONE_ERROR } from '@/lib/locations/use-sede-time-zone';

export type SedeConfigErrorKind = 'currency' | 'timeZone';

/** Textos de la spec G1 §5: la web nunca muestra otro valor en su lugar. */
export const sedeConfigErrorCopy = {
  title: 'Falta un dato de la sede',
  currency:
    'No se pudo saber la moneda de la sede. Vuelve a intentarlo o revisa la sede en Ajustes → Sedes.',
  timeZone: SEDE_TIME_ZONE_ERROR,
  fieldLabel: {
    currency: 'Sin moneda de sede',
    timeZone: 'Sin zona de sede',
  },
} as const;

interface SedeConfigErrorProps {
  /** Qué dato de la sede falta: su moneda o su zona horaria. */
  kind: SedeConfigErrorKind;
  /** Vuelve a leer las sedes (la lista pudo fallar o la sede ya se configuró). */
  onRetry: () => void;
  /**
   * `section` (por defecto) ocupa el sitio del contenido que depende del dato
   * (escalón 1); `field` sustituye a un único control que no se puede rellenar
   * sin él, p. ej. la fecha de un formulario (escalón 2).
   */
  variant?: 'section' | 'field';
  /** Para `field`: el `id` del control sustituido, para que su `<label>` siga teniendo destino. */
  retryId?: string;
  className?: string;
}

/**
 * Una pieza que necesita la moneda o la zona de la sede y no la tiene (sede sin
 * configurar, lista de sedes que no cargó, API antigua). Sigue la escalera de
 * `src/components/errors`: siempre con Reintentar y sin ningún valor de
 * reserva (spec G1 §5, R5).
 */
export function SedeConfigError({ kind, onRetry, variant = 'section', retryId, className }: SedeConfigErrorProps) {
  if (variant === 'field') {
    return (
      <FieldError
        label={sedeConfigErrorCopy.fieldLabel[kind]}
        onRetry={onRetry}
        retryId={retryId}
        className={className}
      />
    );
  }
  return (
    <SectionError
      title={sedeConfigErrorCopy.title}
      description={sedeConfigErrorCopy[kind]}
      onRetry={onRetry}
      className={className}
    />
  );
}
