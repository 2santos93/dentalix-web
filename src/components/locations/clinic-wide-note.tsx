'use client';
import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { getActiveLocationId } from '@/lib/locations/location-store';

/**
 * Aviso de alcance para las vistas cuyo dato es de LA CLÍNICA y no de la sede
 * (pacientes, catálogo, historia clínica…): con una sede activa en el selector,
 * esas pantallas siguen mostrando todo y sin decirlo parecen ignorar el filtro.
 * Ver `PRODUCT.md` → "Multi-sede — ficha centralizada".
 *
 * Solo aparece cuando hay una sede CONCRETA activa: en "Todas las sedes" no hay
 * ninguna contradicción que explicar y el aviso sería ruido.
 *
 * **Va en el hueco `meta` de `PageHeader`**, no suelto entre la cabecera y la
 * barra de filtros: es una propiedad de la pantalla —qué alcance tiene lo que
 * estás viendo—, igual que la marca "Ficha de toda la clínica" de la ficha de
 * paciente, y leído dentro del bloque de identidad se entiende como tal en vez
 * de como un aviso flotando en medio de dos hileras de aire.
 *
 * El recuadro es un relleno `surface-2` sin filete: es el token de los insertos
 * del sistema (DESIGN.md → Colors) y el relleno ya separa, así que un borde
 * `hairline` encima solo añadiría una línea que en claro no se ve contra el
 * propio relleno y en oscuro es del mismo color. Sin color semántico a propósito
 * — no es una advertencia, no hay nada que arreglar; solo dice dónde estás
 * parado. Y pone su propio
 * margen superior porque decide en el cliente si existe: si el margen lo pusiera
 * la cabecera, "Todas las sedes" dejaría un hueco de 12px sin nada dentro.
 */
export function ClinicWideNote({ children }: { children: React.ReactNode }) {
  const [hasActiveLocation, setHasActiveLocation] = useState(false);

  // Igual que `LocationSwitcher`: localStorage solo existe en el cliente, así
  // que no puede leerse como estado inicial sin romper la hidratación.
  useEffect(() => {
    function hydrate() {
      setHasActiveLocation(getActiveLocationId() !== null);
    }
    hydrate();
  }, []);

  if (!hasActiveLocation) return null;

  return (
    <p className="mt-3 flex max-w-[68ch] items-start gap-2.5 rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">
      {/* `mt-0.5` centra el icono en la PRIMERA línea de texto y no en la caja:
          con dos líneas, centrarlo en la caja lo deja flotando entre ambas. */}
      <Building2 aria-hidden className="mt-0.5 size-4 shrink-0 text-muted/80" />
      <span>{children}</span>
    </p>
  );
}
