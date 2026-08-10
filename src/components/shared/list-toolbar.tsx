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
  className?: string;
}

/**
 * La barra de filtrado de una lista: buscador a la izquierda, filtros a su lado.
 *
 * Existe porque las cuatro listas de la app la traían copiada con diferencias
 * mínimas —anchos distintos, la lupa a veces sí y a veces no, el botón unas
 * veces arriba y otras al lado—, y esa es justo la clase de incoherencia que
 * hace que un producto se sienta cosido a mano (DESIGN.md: "la misma
 * gramática visual pantalla a pantalla es una virtud").
 *
 * **Aquí no va la acción primaria.** La tuvo, y esa fue la causa de la
 * incoherencia que venía a resolver: el sistema ofrecía dos sitios válidos para
 * el mismo botón —este y `PageHeader.actions`— y cada vista eligió uno distinto.
 * Gana `PageHeader`, que es lo que manda DESIGN.md ("title left, one primary
 * action right") y lo único que funciona igual en las fichas de detalle, que no
 * tienen barra de filtros. Este componente filtra; no crea.
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
  className,
}: ListToolbarProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative">
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
            className="pl-9 pr-9 sm:w-72 [&::-webkit-search-cancel-button]:hidden"
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
