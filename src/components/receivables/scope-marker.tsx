import * as React from 'react';
import { Building2 } from 'lucide-react';

export const scopeMarkerCopy = {
  // El mismo nombre que la caja y el selector de sede (crítica ops, patrón 9).
  all: 'Todas las sedes',
};

/**
 * Marca de alcance en el hueco `meta` de `PageHeader` de los informes de cobro
 * (Cartera, Descuentos): de qué sede son estos números. El nombre viene de la
 * respuesta (`scope.location`), no del selector: es la sede que el servidor
 * aplicó de verdad. Relleno hundido y sin color semántico: no avisa de nada,
 * solo dice dónde estás.
 */
export function ScopeMarker({ location }: { location: { name: string } | null }) {
  return (
    <p data-testid="scope-marker" className="mt-3 inline-flex max-w-[68ch] items-center gap-2 rounded-lg bg-surface-sunken px-3 py-1.5 text-sm text-muted">
      <Building2 aria-hidden className="size-4 shrink-0" />
      <span>{location ? location.name : scopeMarkerCopy.all}</span>
    </p>
  );
}
