'use client';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/auth/auth-store';
import { listLocations, type ClinicLocation } from '@/lib/locations/locations-api';
import {
  getActiveLocationId,
  setActiveLocationId,
} from '@/lib/locations/location-store';
import { cn } from '@/lib/utils';
import { ChevronDown, MapPin } from 'lucide-react';

const copy = {
  label: 'Sede',
  all: 'Todas las sedes',
};

// `appearance-none` + chevron propio: el select nativo pinta su flecha con el
// estilo del sistema, que no cuadra con el resto de controles (ui/select).
const fieldClass =
  'h-9 appearance-none rounded-lg border border-border bg-surface pl-8 pr-8 text-sm text-ink transition-colors hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg';

/**
 * Selector de sede. Se muestra en cuanto la clínica tiene AL MENOS UNA sede.
 *
 * Antes se escondía con menos de dos, por no meter ruido con un selector de una
 * sola opción. El problema es que entonces la sede activa deja de verse en
 * ninguna parte: con una sede el usuario no sabe si está mirando "esa sede" o
 * "todo", y el aviso de alcance de `ClinicWideNote` aparece sin nada visible que
 * lo explique. Mostrarlo siempre hace que el ámbito sea legible, y de paso deja
 * de ser una sorpresa el día que se da de alta la segunda.
 *
 * - `variant="block"`: fila a lo ancho para el pie del sidebar (desktop), justo
 *   encima de la tarjeta de cuenta.
 * - `variant="rail"`: botón cuadrado de icono para el sidebar colapsado.
 * - `variant="inline"`: compacto, para el topbar móvil (donde no hay sidebar).
 *
 * Cambiar de sede recarga la vista actual (`router.refresh()` no basta: los
 * datos los piden componentes cliente con useEffect, no el servidor), así que
 * se fuerza un reload — es una acción deliberada y poco frecuente.
 */
export function LocationSwitcher({
  variant = 'inline',
}: {
  variant?: 'inline' | 'block' | 'rail';
}) {
  const token = useAuthStore((s) => s.accessToken);
  const [locations, setLocations] = useState<ClinicLocation[]>([]);
  const [active, setActive] = useState<string | null>(null);

  // Rehidratar la sede elegida: localStorage solo existe en el cliente, así
  // que no puede leerse como estado inicial sin romper la hidratación. La
  // lectura va dentro de una función, como el resto de vistas del proyecto.
  useEffect(() => {
    function hydrate() {
      setActive(getActiveLocationId());
    }
    hydrate();
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load(activeToken: string) {
      try {
        const data = await listLocations(activeToken);
        if (!cancelled) setLocations(data.filter((l) => l.isActive));
      } catch {
        // Best-effort: si falla, simplemente no se ofrece el selector. No
        // merece un error en pantalla — la app sigue funcionando en modo
        // consolidado, que es el comportamiento por defecto.
      }
    }
    void load(token);
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Sin ninguna sede sí se esconde: un selector vacío no ofrece nada. Con una
  // o más, se muestra (ver la nota de arriba).
  if (locations.length === 0) return null;

  function handleChange(value: string) {
    const next = value === '' ? null : value;
    setActive(next);
    setActiveLocationId(next);
    // Recarga para que TODAS las vistas montadas vuelvan a pedir sus datos con
    // la nueva sede, sin tener que cablear una invalidación global.
    window.location.reload();
  }

  const options = (
    <>
      <option value="">{copy.all}</option>
      {locations.map((l) => (
        <option key={l.id} value={l.id}>
          {l.name}
        </option>
      ))}
    </>
  );

  if (variant === 'rail') {
    const activeName = locations.find((l) => l.id === active)?.name ?? copy.all;
    return (
      <label
        title={`${copy.label}: ${activeName}`}
        className="relative flex size-10 items-center justify-center rounded-lg border border-border bg-surface text-muted transition-colors hover:bg-bg hover:text-ink focus-within:ring-2 focus-within:ring-primary"
      >
        <span className="sr-only">{copy.label}</span>
        <MapPin aria-hidden className="size-4" />
        {/* El select nativo, invisible, cubre el icono entero: se ve un botón
            pero el desplegable sigue siendo el del sistema — sin popover propio
            que posicionar ni estado que mantener. */}
        <select
          aria-label={copy.label}
          value={active ?? ''}
          onChange={(e) => handleChange(e.target.value)}
          className="absolute inset-0 cursor-pointer appearance-none opacity-0 focus:outline-none"
        >
          {options}
        </select>
      </label>
    );
  }

  return (
    <label
      className={cn(
        'relative flex items-center',
        variant === 'block' ? 'w-full' : 'inline-flex',
      )}
    >
      <span className="sr-only">{copy.label}</span>
      <MapPin
        aria-hidden
        className="pointer-events-none absolute left-2.5 size-4 text-muted"
      />
      <select
        aria-label={copy.label}
        value={active ?? ''}
        onChange={(e) => handleChange(e.target.value)}
        className={cn(
          fieldClass,
          variant === 'block' ? 'h-10 w-full' : 'max-w-[12rem]',
        )}
      >
        {options}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-2.5 size-4 text-muted"
      />
    </label>
  );
}
