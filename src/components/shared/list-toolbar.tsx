'use client';
import * as React from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const copy = {
  clear: 'Limpiar la búsqueda',
};

/**
 * Clase del `<select>` nativo para que case con el átomo `Input`. Se mantiene
 * nativo a propósito: en móvil abre la rueda del sistema, que es más rápida y
 * accesible que cualquier lista que dibujemos nosotros.
 *
 * Se exporta porque las vistas declaran sus propios filtros como children —
 * cada lista filtra por cosas distintas y no tiene sentido inventar aquí una
 * abstracción de "filtro" que solo sirva para el mínimo común.
 */
export const toolbarFieldClass =
  'flex h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50';

interface ListToolbarProps {
  /** Nombre accesible del campo, p. ej. "Buscar por nombre o documento". */
  searchLabel: string;
  searchPlaceholder: string;
  /** Lo que se ha TECLEADO (sin rebotar). La vista se encarga del debounce. */
  value: string;
  onChange: (value: string) => void;
  /** Selects y conmutadores de la vista. */
  children?: React.ReactNode;
  /**
   * La acción primaria de la lista ("Nuevo paciente", "Agregar insumo"): un
   * único `Button`, alineado a la derecha y a la altura de los filtros.
   *
   * En móvil se estira al ancho de la barra —el contenedor apila y estira— y
   * cierra el bloque: primero se busca, después se crea.
   */
  action?: React.ReactNode;
  className?: string;
}

/**
 * La barra de una lista: buscador y filtros a la izquierda, la acción primaria
 * a la derecha.
 *
 * Existe porque las cuatro listas de la app la traían copiada con diferencias
 * mínimas —anchos distintos, la lupa a veces sí y a veces no, el botón unas
 * veces arriba y otras al lado—, y esa es justo la clase de incoherencia que
 * hace que un producto se sienta cosido a mano (DESIGN.md: "la misma
 * gramática visual pantalla a pantalla es una virtud").
 *
 * **La acción primaria de una lista va aquí, no en `PageHeader`** (decisión del
 * owner, 2026-08-10). Colgada de la cabecera quedaba una fila más arriba que los
 * controles con los que se usa, con un vacío de 1000px a su izquierda y sin nada
 * que la alineara: la cabecera es identidad, y crear no es identidad. En esta
 * fila el botón cae al final del grupo que ya gobierna la lista —buscar,
 * filtrar, crear— y a la misma altura, que es como lo pinta la agenda desde el
 * principio. En las FICHAS, que no tienen barra de filtros, la acción sigue en
 * `PageHeader.actions`; ahí no hay dos sitios posibles.
 *
 * En móvil apila y el buscador ocupa todo el ancho; desde `sm` los filtros se
 * ponen en fila. El campo lleva un botón para vaciarlo: borrar a manotazos con
 * la tecla de retroceso una búsqueda larga es una fricción tonta y gratuita.
 */
export function ListToolbar({
  searchLabel,
  searchPlaceholder,
  value,
  onChange,
  children,
  action,
  className,
}: ListToolbarProps) {
  return (
    <div
      className={cn(
        // `sm:items-start` y no `items-center`: cuando los filtros no caben en
        // una línea y el grupo de la izquierda se parte en dos, el botón se queda
        // arriba, a la altura de la primera fila de controles, en vez de bajar a
        // centrarse contra un bloque de dos líneas.
        'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4',
        className,
      )}
    >
      {/* `flex-wrap` + `min-w-0`: entre 768 y 1200px el buscador y dos filtros de
          ancho fijo ya no caben junto al botón, y sin poder partirse la fila
          empujaba el contenido fuera de la pantalla (barra horizontal en toda la
          página). Ahora los filtros bajan de línea y el buscador puede encogerse
          por debajo de sus 288px si hace falta. */}
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-0 sm:w-72">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          />
          <Input
            type="search"
            aria-label={searchLabel}
            placeholder={searchPlaceholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            // `pr-9` reserva el hueco del botón de limpiar para que el texto no
            // pase por debajo; `[&::-webkit-search-cancel-button]:hidden` quita
            // la X nativa de WebKit, que aparecería junto a la nuestra.
            // El ancho lo pone el envoltorio (`sm:w-72`), no el campo: así el
            // campo puede seguirlo cuando el flex lo encoge.
            className="w-full pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden"
          />
          {value ? (
            <button
              type="button"
              aria-label={copy.clear}
              onClick={() => onChange('')}
              className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          ) : null}
        </div>
        {children}
      </div>
      {/* `flex-col` sin `items-*`: en móvil el botón se estira al ancho de la
          barra por el `stretch` por defecto, sin que cada vista tenga que
          repetir un `w-full sm:w-auto`. Desde `sm` vuelve a su ancho natural.
          El `mt-1` de móvil (16px en total) separa "filtrar" de "crear": con los
          mismos 12px que hay entre los selects, un botón del mismo ancho se lee
          como un filtro más de la pila. */}
      {action ? (
        <div className="mt-1 flex shrink-0 flex-col sm:mt-0 sm:flex-row sm:items-center sm:gap-2">
          {action}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Cuántas filas hay: "137 procedimientos", "1 insumo".
 *
 * Existe porque `Pagination` no pinta nada cuando todo cabe en una página —lo
 * cual es correcto— y entonces una búsqueda que devuelve tres resultados no
 * decía en ninguna parte que eran tres. Con `aria-live` el número se anuncia al
 * teclear, que es la única señal que recibe quien no ve la tabla encogerse.
 *
 * El texto es solo número + sustantivo, sin participio ("encontrados"), porque
 * el género lo pone el sustantivo de cada vista y "3 citas encontrados" es un
 * error que aparecería en cuanto alguien reutilizara esto en la agenda.
 */
export function ResultCount({
  total,
  noun,
  nounPlural,
}: {
  total: number;
  /** Singular, para cuando `total` es exactamente 1. */
  noun: string;
  nounPlural: string;
}) {
  return (
    <p
      className="text-sm text-muted tabular-nums"
      role="status"
      aria-live="polite"
    >
      {total} {total === 1 ? noun : nounPlural}
    </p>
  );
}
