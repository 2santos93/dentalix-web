'use client';
import { useSessionLocations } from '@/lib/locations/session-locations';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenAllowedLocationIds } from '@/lib/auth/token-role';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import {
  getActiveLocationId,
  setActiveLocationId,
} from '@/lib/locations/location-store';
import { cn } from '@/lib/utils';
import { ChevronDown, MapPin } from 'lucide-react';
import { NativeSelect } from '@/components/ui/native-select';

const copy = {
  label: 'Sede',
  all: 'Todas las sedes',
  // DX-089: un miembro acotado a varias sedes ve la vista conjunta de LAS SUYAS,
  // no la de la clínica entera.
  mine: 'Mis sedes',
  // Rótulos cortos del botón del teléfono (el nombre entero va en el nombre accesible).
  allShort: 'Todas',
  mineShort: 'Mías',
};

/**
 * Rótulo corto de una sede para el botón del teléfono: sin el genérico «Sede»
 * delante («Sede Norte» → «Norte») y solo la primera palabra; el CSS lo
 * recorta si aun así no cabe. Nunca vacío: si todo era genérico, el nombre.
 */
export function shortSedeLabel(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const meaningful = words.filter((w) => !/^(sede|sucursal|cl[ií]nica)$/i.test(w));
  return (meaningful[0] ?? words[0] ?? name).replace(/[,.;:]$/, '');
}


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
 * - `variant="inline"`: en línea, con el nombre entero hasta 12rem.
 * - `variant="compact"`: selector con nombre, hasta 8.5rem.
 * - `variant="phone"`: barra superior del teléfono (K2): pastilla de 44px con
 *   el pin y un rótulo corto («Norte», «Todas»); nombre accesible «Sede: …»
 *   con el nombre entero. Abre el mismo desplegable nativo. Deja el ancho a la
 *   marca de la clínica, que antes se cortaba junto al selector.
 *
 * Con sedes acotadas (claim `loc` del token, DX-089) solo se ofrecen las
 * permitidas y nunca «Todas las sedes»: con varias, la opción vacía pasa a ser
 * «Mis sedes» (la API responde sobre las suyas); con una sola, queda elegida y
 * sin opción vacía.
 *
 * Cambiar de sede recarga la vista actual (`router.refresh()` no basta: los
 * datos los piden componentes cliente con useEffect, no el servidor), así que
 * se fuerza un reload — es una acción deliberada y poco frecuente.
 */
export function LocationSwitcher({
  variant = 'inline',
}: {
  variant?: 'inline' | 'block' | 'rail' | 'compact' | 'phone';
}) {
  const token = useAuthStore((s) => s.accessToken);
  const requestLocations = useSessionLocations(token);
  const [locations, setLocations] = useState<ClinicLocation[]>([]);
  const [active, setActive] = useState<string | null>(null);
  // `null` = sin restricción. Se lee del token: cambia justo al renovarlo, que
  // es cuando la API empieza a aplicar un cambio de sedes.
  const allowed = getTokenAllowedLocationIds(token);
  const restricted = allowed !== null;
  const allowedKey = allowed?.join(',') ?? null;

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
    async function load() {
      try {
        const data = await requestLocations();
        if (cancelled) return;
        // La API ya filtra `GET /locations` para un miembro acotado; filtrar
        // también aquí por el claim evita ofrecer una sede que daría 403 si
        // las dos fuentes no van a la par (p. ej. lista cacheada).
        const permitidas = allowedKey === null ? null : allowedKey.split(',');
        const usables = data.filter(
          (l) => l.isActive && (permitidas === null || permitidas.includes(l.id)),
        );
        setLocations(usables);

        // Reconciliar la sede guardada contra las que existen DE VERDAD.
        //
        // La elección vive en localStorage y sobrevive a la sede: si se borra
        // o se desactiva —o si se reseedea la base y cambian los ids— queda un
        // id huérfano que `api/client.ts` sigue mandando como `X-Location-Id`
        // en CADA petición, y el backend contesta 400 "Unknown location for
        // this clinic" a todas. La app entera queda inutilizable hasta que
        // alguien limpia localStorage a mano, sin nada en pantalla que explique
        // por qué. Soltarla aquí devuelve al usuario a la vista consolidada,
        // que es el comportamiento por defecto y siempre es válido.
        const guardada = getActiveLocationId();
        const guardadaValida = guardada !== null && usables.some((l) => l.id === guardada);
        if (permitidas !== null && usables.length > 0) {
          // Acotado: una sede no permitida no se suelta a «todas» (no existe
          // para él) sino a la primera de las suyas; y con una sola, esa queda
          // siempre elegida.
          const siguiente =
            usables.length === 1
              ? usables[0].id
              : guardada === null || guardadaValida
                ? guardada
                : usables[0].id;
          if (siguiente !== guardada) setActiveLocationId(siguiente);
          setActive(siguiente);
        } else if (guardada && !guardadaValida) {
          setActiveLocationId(null);
          setActive(null);
        }
      } catch {
        // Best-effort: si falla, simplemente no se ofrece el selector. No
        // merece un error en pantalla — la app sigue funcionando en modo
        // consolidado, que es el comportamiento por defecto.
        //
        // Y NO se descarta la sede guardada: un fallo de red no es prueba de
        // que haya desaparecido, y tirarla aquí sacaría al usuario de su sede
        // cada vez que la petición falle.
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, allowedKey, requestLocations]);

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

  // Acotado a una sola sede: no hay vista conjunta que ofrecer.
  const emptyLabel = restricted ? (locations.length > 1 ? copy.mine : null) : copy.all;

  const options = (
    <>
      {emptyLabel && <option value="">{emptyLabel}</option>}
      {locations.map((l) => (
        <option key={l.id} value={l.id}>
          {l.name}
        </option>
      ))}
    </>
  );

  // Un solo select invisible para el raíl y el teléfono: cubre el botón entero
  // y abre el desplegable del sistema. El foco lo pinta el botón que lo lleva.
  const overlaySelect = (name: string) => (
    <NativeSelect
      aria-label={name}
      value={active ?? ''}
      onChange={(e) => handleChange(e.target.value)}
      className="absolute inset-0 opacity-0"
      selectClassName="h-full pointer-coarse:h-full focus-visible:outline-none"
    >
      {options}
    </NativeSelect>
  );

  if (variant === 'phone') {
    const activeName = locations.find((l) => l.id === active)?.name;
    const fullName = activeName ?? emptyLabel ?? copy.all;
    const short = activeName
      ? shortSedeLabel(activeName)
      : emptyLabel === copy.mine
        ? copy.mineShort
        : copy.allShort;
    return (
      <span
        title={`${copy.label}: ${fullName}`}
        className="relative inline-flex h-11 max-w-[6.5rem] shrink-0 items-center gap-1 rounded-lg px-2 text-muted transition-colors hover:bg-surface-sunken hover:text-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary-text"
      >
        <MapPin aria-hidden className="size-4 shrink-0" />
        <span aria-hidden className="min-w-0 truncate text-[0.8125rem] font-medium text-ink">
          {short}
        </span>
        <ChevronDown aria-hidden className="size-3.5 shrink-0" />
        {/* El select nativo, invisible, cubre la pastilla entera: el
            desplegable es el del sistema, como en el raíl. */}
        {overlaySelect(`${copy.label}: ${fullName}`)}
      </span>
    );
  }

  if (variant === 'rail') {
    const activeName = locations.find((l) => l.id === active)?.name ?? emptyLabel ?? copy.all;
    return (
      <label
        title={`${copy.label}: ${activeName}`}
        className="relative flex size-10 items-center justify-center rounded-lg border border-border bg-surface text-muted transition-colors hover:bg-surface-sunken hover:text-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary-text"
      >
        <span className="sr-only">{copy.label}</span>
        <MapPin aria-hidden className="size-4" />
        {/* El select nativo, invisible, cubre el icono entero: se ve un botón
            pero el desplegable sigue siendo el del sistema — sin popover propio
            que posicionar ni estado que mantener. */}
        {overlaySelect(copy.label)}
      </label>
    );
  }

  return (
    <label className={cn('relative flex items-center', variant === 'block' ? 'w-full' : 'inline-flex')}>
      <span className="sr-only">{copy.label}</span>
      <NativeSelect
        aria-label={copy.label}
        value={active ?? ''}
        onChange={(e) => handleChange(e.target.value)}
        className={cn(
          variant === 'block' && 'w-full',
          variant === 'inline' && 'w-auto max-w-[12rem]',
          variant === 'compact' && 'w-auto max-w-[8.5rem]',
        )}
        selectClassName="pl-8"
      >
        {options}
      </NativeSelect>
      <MapPin aria-hidden className="pointer-events-none absolute left-2.5 size-4 text-muted" />
    </label>
  );
}
