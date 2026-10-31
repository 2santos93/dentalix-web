'use client';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { useHorizontalOverflow } from '@/lib/ui/use-horizontal-overflow';

/**
 * Tabla que se apila en móvil.
 *
 * Para una LISTA nueva usa `DataList` (`./data-list`): tarjeta compacta de dos
 * líneas en el teléfono en vez de este apilado «etiqueta: valor», que daba
 * tarjetas de 165–500px (DESIGN.md → Tables). Esto queda para las tablas que
 * ya lo usan y como pieza de `DataList`.
 *
 * DESIGN.md lo pide —"Tables collapse to stacked labeled cards below `sm`"— y
 * ninguna tabla lo hacía: en un teléfono había que arrastrar de lado para leer
 * una fila, que es justo lo que el sistema dice evitar.
 *
 * Se resuelve en el primitivo, con CSS, en vez de duplicar cada tabla en una
 * versión "tarjetas" y otra "tabla": el marcado sigue siendo UNA tabla —así que
 * sigue siendo una tabla para un lector de pantalla, con sus relaciones intactas—
 * y bajo `sm` los `display` cambian a bloque. La etiqueta de cada celda se pinta
 * desde `data-label` con `before:content-[attr(data-label)]`, sin marcado extra.
 *
 * El contrato para quien la use: **cada `TableCell` lleva `data-label` con el
 * texto de su columna.** Sin eso, en móvil la celda aparece sin decir qué es.
 *
 * Entre `sm` y el escritorio hay una franja incómoda —tablet en vertical, donde
 * el raíl ya ocupa 240px— en la que una tabla de seis columnas no cabe: se
 * desplaza de lado dentro de su tarjeta, sin que la página crezca. Eso es
 * correcto, pero un marco que se desplaza y no lo dice esconde sus últimas
 * columnas: no había forma de llegar a ellas con el teclado (WCAG 2.1.1) ni señal
 * visual de que hubiera más. Cuando de verdad no cabe, el marco pasa a ser una
 * región enfocable y con nombre, y se le pintan sombras en los bordes con
 * contenido por ver (`.scroll-x-shadows`).
 */
/**
 * ¿Se apila bajo `sm`? Por defecto sí (el contrato de siempre). Las tablas de
 * COMPARACIÓN —leer una columna de arriba abajo: caja del día, reportes,
 * perio— no se apilan: se desplazan de lado con la primera columna fija
 * (`DataList phone="scroll"`, DESIGN.md → Tables). Contexto y no prop en cada
 * pieza para no obligar a repetirlo en cabecera, cuerpo, filas y celdas.
 */
const TableStackContext = React.createContext(true);

interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  /** `false`: no se apila en el teléfono (tabla de comparación). Por defecto `true`. */
  stack?: boolean;
}

function Table({ className, stack = true, ...props }: TableProps) {
  const [viewport, scrollable] = useHorizontalOverflow<HTMLDivElement>();

  return (
    <div
      ref={viewport}
      className={cn(
        'relative w-full overflow-x-auto',
        scrollable && 'scroll-x-shadows',
        // El anillo va por dentro (`-outline-offset-2`): la tarjeta que envuelve
        // la tabla recorta lo que se salga, así que un foco por fuera no se vería.
        'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-text',
      )}
      // Rol, nombre y parada de tabulador SOLO cuando hay algo escondido: en una
      // tabla que cabe, una región de más es ruido para un lector de pantalla y
      // una parada de tabulador que no lleva a ninguna parte.
      {...(scrollable
        ? {
            role: 'region',
            tabIndex: 0,
            'aria-label': props['aria-label'],
          }
        : {})}
    >
      <TableStackContext.Provider value={stack}>
        <table
          className={cn(
            'w-full caption-bottom text-sm',
            // Bajo `sm` la tabla deja de comportarse como tabla: filas en bloque,
            // cabecera oculta (su texto lo reponen los `data-label`).
            stack && 'max-sm:block',
            className,
          )}
          {...props}
        />
      </TableStackContext.Provider>
    </div>
  );
}

function TableHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  const stack = React.useContext(TableStackContext);
  return (
    <thead
      className={cn(
        '[&_tr]:border-b [&_tr]:border-border',
        // No se usa `hidden`: eso lo sacaría del árbol de accesibilidad y la
        // tabla perdería sus cabeceras de columna. `sr-only` lo saca de la
        // vista conservándolas.
        stack && 'max-sm:sr-only',
        className,
      )}
      {...props}
    />
  );
}

function TableBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  const stack = React.useContext(TableStackContext);
  return (
    <tbody
      className={cn('[&_tr:last-child]:border-0', stack && 'max-sm:block', className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  const stack = React.useContext(TableStackContext);
  return (
    <tr
      className={cn(
        'border-b border-border transition-colors hover:bg-bg/60 data-[state=selected]:bg-bg',
        // Cada fila es una tarjeta en móvil: bloque, con aire y separada de la
        // siguiente por la misma hairline que ya usa en escritorio.
        stack && 'max-sm:block max-sm:px-4 max-sm:py-3',
        className,
      )}
      {...props}
    />
  );
}

function TableHead({
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        // Tipo frase, nunca mayúsculas espaciadas (DESIGN.md → Typography: Label).
        'h-11 px-4 text-left align-middle t-label text-muted',
        className,
      )}
      {...props}
    />
  );
}

function TableCell({
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  const stack = React.useContext(TableStackContext);
  return (
    <td
      className={cn(
        'px-4 py-3 align-middle text-ink',
        // En móvil: etiqueta a la izquierda (desde `data-label`) y valor a la
        // derecha, en una línea por celda. `empty:hidden` evita que una celda
        // sin contenido deje una fila huérfana con solo su etiqueta.
        stack &&
          'max-sm:flex max-sm:items-baseline max-sm:justify-between max-sm:gap-4 max-sm:px-0 max-sm:py-1.5',
        stack &&
          'max-sm:before:content-[attr(data-label)] max-sm:before:text-xs max-sm:before:font-medium max-sm:before:text-muted',
        className,
      )}
      {...props}
    />
  );
}

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
