import Link from 'next/link';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
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
  configure: 'Configurar sede',
  retry: 'Reintentar',
} as const;

/** Ajustes → Sedes; con una sede, abre su modal (`?sede=<id>`). */
export function sedeSettingsHref(locationId?: string | null): string {
  return locationId ? `/settings/sedes?sede=${encodeURIComponent(locationId)}` : '/settings/sedes';
}

interface SedeConfigErrorProps {
  /** Qué dato de la sede falta: su moneda o su zona horaria. */
  kind: SedeConfigErrorKind;
  /** Vuelve a leer las sedes (la lista pudo fallar o la sede ya se configuró). */
  onRetry: () => void;
  /**
   * `section` (por defecto) ocupa el sitio del contenido que depende del dato
   * (escalón 1); `field` sustituye a un único control que no se puede rellenar
   * sin él, p. ej. la fecha de un formulario (escalón 2); `note` es una línea
   * sobre un contenido que sigue siendo correcto sin el dato (p. ej. los precios
   * del catálogo, que se pintan sin símbolo), con su Reintentar.
   */
  variant?: 'section' | 'field' | 'note';
  /** Para `field`: el `id` del control sustituido, para que su `<label>` siga teniendo destino. */
  retryId?: string;
  /**
   * Sección: qué pasó, cuando quien llama lo sabe mejor que el texto genérico
   * (p. ej. `useSedeTimeZone` sin ninguna sede activa).
   */
  description?: string;
  /** La sede a la que le falta el dato, si se sabe: «Configurar sede» abre su modal. */
  locationId?: string | null;
  className?: string;
}

/**
 * Una pieza que necesita la moneda o la zona de la sede y no la tiene (sede sin
 * configurar, lista de sedes que no cargó, API antigua). Sigue la escalera de
 * `src/components/errors`: siempre con Reintentar y sin ningún valor de
 * reserva (spec G1 §5, R5). Para ADMIN, la sección ofrece además «Configurar
 * sede» (Ajustes → Sedes); la variante de campo no tiene sitio para él.
 */
export function SedeConfigError({
  kind,
  onRetry,
  variant = 'section',
  retryId,
  description,
  locationId,
  className,
}: SedeConfigErrorProps) {
  const token = useAuthStore((s) => s.accessToken);
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
  // Solo ADMIN puede arreglarlo: a él se le ofrece el camino (spec G1 §5).
  const isAdmin = getTokenRole(token) === 'ADMIN';
  const configure = isAdmin ? (
    <Button asChild variant="secondary" size={variant === 'note' ? 'sm' : undefined}>
      <Link href={sedeSettingsHref(locationId)}>{sedeConfigErrorCopy.configure}</Link>
    </Button>
  ) : null;
  if (variant === 'note') {
    return (
      <div
        role="status"
        className={cn(
          'flex flex-col gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm sm:flex-row sm:items-center',
          className,
        )}
      >
        <span className="flex flex-1 items-start gap-2 text-ink">
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
          {description ?? sedeConfigErrorCopy[kind]}
        </span>
        <span className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
            {sedeConfigErrorCopy.retry}
          </Button>
          {configure}
        </span>
      </div>
    );
  }
  return (
    <SectionError
      title={sedeConfigErrorCopy.title}
      description={description ?? sedeConfigErrorCopy[kind]}
      onRetry={onRetry}
      secondaryAction={configure}
      className={className}
    />
  );
}
