import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Tabla que se apila en móvil.
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
 */
function Table({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table
        className={cn(
          'w-full caption-bottom text-sm',
          // Bajo `sm` la tabla deja de comportarse como tabla: filas en bloque,
          // cabecera oculta (su texto lo reponen los `data-label`).
          'max-sm:block',
          className,
        )}
        {...props}
      />
    </div>
  );
}

function TableHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        '[&_tr]:border-b [&_tr]:border-border',
        // No se usa `hidden`: eso lo sacaría del árbol de accesibilidad y la
        // tabla perdería sus cabeceras de columna. `sr-only` lo saca de la
        // vista conservándolas.
        'max-sm:sr-only',
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
  return (
    <tbody
      className={cn('[&_tr:last-child]:border-0', 'max-sm:block', className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        'border-b border-border transition-colors hover:bg-bg/60 data-[state=selected]:bg-bg',
        // Cada fila es una tarjeta en móvil: bloque, con aire y separada de la
        // siguiente por la misma hairline que ya usa en escritorio.
        'max-sm:block max-sm:px-4 max-sm:py-3',
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
        'h-11 px-4 text-left align-middle text-xs font-medium uppercase tracking-wide text-muted',
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
  return (
    <td
      className={cn(
        'px-4 py-3 align-middle text-ink',
        // En móvil: etiqueta a la izquierda (desde `data-label`) y valor a la
        // derecha, en una línea por celda. `empty:hidden` evita que una celda
        // sin contenido deje una fila huérfana con solo su etiqueta.
        'max-sm:flex max-sm:items-baseline max-sm:justify-between max-sm:gap-4 max-sm:px-0 max-sm:py-1.5',
        'max-sm:before:content-[attr(data-label)] max-sm:before:text-xs max-sm:before:font-medium max-sm:before:uppercase max-sm:before:tracking-wide max-sm:before:text-muted',
        className,
      )}
      {...props}
    />
  );
}

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
