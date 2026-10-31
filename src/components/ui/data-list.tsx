'use client';
import * as React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/lib/hooks/use-media-query';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RowActions, type RowAction } from '@/components/shared/row-actions';

/**
 * Papel de una columna en la tarjeta compacta del teléfono (DESIGN.md → Tables):
 *
 * - `primary`: línea 1, a la izquierda (tinta, 15px/600). Una por lista; si
 *   ninguna lo declara, la primera columna.
 * - `trailing`: línea 1, a la derecha — el dato clave (importe, hora, edad) o
 *   el estado. Una como mucho.
 * - `meta`: línea 2, en `muted`, unidas con « · ». Los valores vacíos se saltan.
 * - `hidden`: no sale en el teléfono (está en la ficha). Nunca un importe.
 */
export type DataListMobileRole = 'primary' | 'meta' | 'trailing' | 'hidden';

export interface DataListColumn<T> {
  /** Clave estable de la columna. */
  id: string;
  /** Texto de la cabecera (escritorio). */
  header: React.ReactNode;
  /** Contenido de la celda en la tabla. */
  cell: (row: T) => React.ReactNode;
  /**
   * Contenido en la tarjeta del teléfono, si debe diferir del de la tabla. Para
   * `meta`, devuelve `null` cuando no hay dato: así la línea no dice «—».
   */
  mobileCell?: (row: T) => React.ReactNode;
  /** Papel en el teléfono. Por defecto `meta`. */
  mobile?: DataListMobileRole;
  /** Cifras (importes, edades, conteos): a la derecha y tabulares. */
  numeric?: boolean;
  /** Alineación de la columna; `numeric` implica `end`. */
  align?: 'start' | 'end';
  /** La columna solo aparece en la tabla a partir de este ancho (tablet estrecha). */
  showFrom?: 'md' | 'lg' | 'xl';
  headerClassName?: string;
  cellClassName?: string;
}

export interface DataListProps<T> {
  /** Nombre accesible de la tabla y de la lista («Pacientes»). */
  label: string;
  rows: readonly T[];
  columns: readonly DataListColumn<T>[];
  getRowKey: (row: T) => string;
  /** La fila abre algo: toda la fila (y toda la tarjeta) es el objetivo. */
  getRowHref?: (row: T) => string;
  /** Alternativa a `getRowHref` cuando abrir no es navegar (un modal). */
  onRowClick?: (row: T) => void;
  /** Delante de la columna principal en los dos modos (avatar, icono). */
  leading?: (row: T) => React.ReactNode;
  /** Acciones de la fila, detrás del «⋯» de `RowActions`. */
  rowActions?: (row: T) => RowAction[];
  /** Identifica la fila para el «⋯»: «Acciones de {label}». Obligatorio con `rowActions`. */
  getRowLabel?: (row: T) => string;
  /**
   * Teléfono (<640px): `cards` (por defecto) = tarjeta compacta de dos líneas;
   * `scroll` = tabla de comparación, desplazamiento lateral con la primera
   * columna fija.
   */
  phone?: 'cards' | 'scroll';
  loading?: boolean;
  /** Texto del estado de carga para lectores de pantalla. */
  loadingLabel?: string;
  /** Qué pintar sin filas (normalmente un `EmptyState`). */
  empty?: React.ReactNode;
  className?: string;
}

/** Teléfono: por debajo de `sm`, el mismo corte que el apilado de `Table`. */
export const DATA_LIST_PHONE_QUERY = '(max-width: 639.98px)';

const copy = {
  actionsHeader: 'Acciones',
  actionsOf: (label: string) => `Acciones de ${label}`,
  loading: 'Cargando…',
};

const showFromClass = { md: 'hidden md:table-cell', lg: 'hidden lg:table-cell', xl: 'hidden xl:table-cell' };

function isBlank(node: React.ReactNode): boolean {
  return node === null || node === undefined || node === false || node === '';
}

/**
 * La lista del sistema: UNA declaración de columnas que se pinta como tabla de
 * verdad en tablet y escritorio y como lista de tarjetas compactas en el
 * teléfono (DESIGN.md → Tables, critique-ops §6: el apilado «etiqueta: valor»
 * dejaba tarjetas de 165–500px y una fila «ACCIONES» muerta).
 *
 * Por qué dos marcados y no CSS sobre una tabla: en el teléfono la semántica
 * correcta es una lista (cada tarjeta es UN objetivo táctil que abre la ficha),
 * y una tabla con `display: flex` pierde sus roles en Safari sin ganar los de
 * lista. Se elige el marcado por `matchMedia` y solo se monta uno: sin `matchMedia`
 * (servidor, jsdom) sale la tabla, así que los tests siguen viendo una tabla y
 * no hay duplicados en el DOM. Las vistas que usan esto piden sus datos en el
 * cliente tras montar, así que no hay salto visible al hidratar.
 */
export function DataList<T>({
  label,
  rows,
  columns,
  getRowKey,
  getRowHref,
  onRowClick,
  leading,
  rowActions,
  getRowLabel,
  phone = 'cards',
  loading = false,
  loadingLabel = copy.loading,
  empty,
  className,
}: DataListProps<T>) {
  const isPhone = useMediaQuery(DATA_LIST_PHONE_QUERY);

  if (loading) {
    return (
      <Card className={cn('overflow-hidden p-2', className)}>
        <span role="status" className="sr-only">
          {loadingLabel}
        </span>
        <div className="flex flex-col gap-2 p-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  if (rows.length === 0 && empty !== undefined) return <>{empty}</>;

  const props = { label, rows, columns, getRowKey, getRowHref, onRowClick, leading, rowActions, getRowLabel };

  return (
    <Card className={cn('overflow-hidden p-0', className)}>
      {isPhone && phone === 'cards' ? <PhoneList {...props} /> : <DataTable {...props} sticky={isPhone} />}
    </Card>
  );
}

type InnerProps<T> = Pick<
  DataListProps<T>,
  'label' | 'rows' | 'columns' | 'getRowKey' | 'getRowHref' | 'onRowClick' | 'leading' | 'rowActions' | 'getRowLabel'
>;

function primaryIndex<T>(columns: readonly DataListColumn<T>[]): number {
  const i = columns.findIndex((c) => c.mobile === 'primary');
  return i === -1 ? 0 : i;
}

function actionsLabel<T>(row: T, getRowLabel: ((row: T) => string) | undefined): string {
  return getRowLabel ? copy.actionsOf(getRowLabel(row)) : copy.actionsHeader;
}

/* ------------------------------------------------------------------ tabla -- */

function DataTable<T>({
  label,
  rows,
  columns,
  getRowKey,
  getRowHref,
  onRowClick,
  leading,
  rowActions,
  getRowLabel,
  sticky,
}: InnerProps<T> & { sticky: boolean }) {
  const primary = primaryIndex(columns);
  const opens = Boolean(getRowHref || onRowClick);

  // Primera columna fija: solo en el teléfono con `phone="scroll"`; con ancho
  // de sobra no hay nada que fijar.
  const stickyClass =
    'sticky left-0 z-[1] border-r border-border bg-surface group-hover:bg-[color-mix(in_oklab,var(--color-bg)_60%,var(--color-surface))]';

  return (
    <Table aria-label={label} stack={false}>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {columns.map((col, i) => (
            <TableHead
              key={col.id}
              className={cn(
                (col.numeric || col.align === 'end') && 'text-right',
                col.showFrom && showFromClass[col.showFrom],
                sticky && i === 0 && 'sticky left-0 z-[1] border-r border-border bg-surface',
                col.headerClassName,
              )}
            >
              {col.header}
            </TableHead>
          ))}
          {rowActions ? (
            <TableHead className="w-12">
              <span className="sr-only">{copy.actionsHeader}</span>
            </TableHead>
          ) : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const href = getRowHref?.(row);
          return (
            <TableRow
              key={getRowKey(row)}
              // `relative` ancla el enlace estirado de la celda principal: toda
              // la fila abre, pero el lector de pantalla oye UN enlace por fila.
              className={cn('group', opens && 'relative cursor-pointer')}
            >
              {columns.map((col, i) => {
                const content = col.cell(row);
                const isPrimary = i === primary;
                return (
                  <TableCell
                    key={col.id}
                    className={cn(
                      (col.numeric || col.align === 'end') && 'text-right',
                      col.numeric && 'tabular-nums',
                      col.showFrom && showFromClass[col.showFrom],
                      sticky && i === 0 && stickyClass,
                      col.cellClassName,
                    )}
                  >
                    {isPrimary ? (
                      <PrimaryCell
                        row={row}
                        href={href}
                        onRowClick={onRowClick}
                        leading={leading?.(row)}
                      >
                        {content}
                      </PrimaryCell>
                    ) : (
                      content
                    )}
                  </TableCell>
                );
              })}
              {rowActions ? (
                <TableCell className="w-12 py-1 text-right">
                  <RowActions label={actionsLabel(row, getRowLabel)} actions={rowActions(row)} />
                </TableCell>
              ) : null}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

const stretchedClass =
  'after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-primary-text';

function PrimaryCell<T>({
  row,
  href,
  onRowClick,
  leading,
  children,
}: {
  row: T;
  href: string | undefined;
  onRowClick: ((row: T) => void) | undefined;
  leading: React.ReactNode;
  children: React.ReactNode;
}) {
  const inner = (
    <>
      {leading}
      <span className="min-w-0">{children}</span>
    </>
  );
  const layout = 'flex items-center gap-3 font-medium text-ink';
  if (href) {
    return (
      <Link href={href} className={cn(layout, 'group-hover:text-primary-text', stretchedClass)}>
        {inner}
      </Link>
    );
  }
  if (onRowClick) {
    return (
      <button
        type="button"
        onClick={() => onRowClick(row)}
        className={cn(layout, 'text-left group-hover:text-primary-text', stretchedClass)}
      >
        {inner}
      </button>
    );
  }
  return <div className={layout}>{inner}</div>;
}

/* --------------------------------------------------------------- teléfono -- */

function PhoneList<T>({
  label,
  rows,
  columns,
  getRowKey,
  getRowHref,
  onRowClick,
  leading,
  rowActions,
  getRowLabel,
}: InnerProps<T>) {
  const primary = primaryIndex(columns);
  const trailing = columns.find((c) => c.mobile === 'trailing');
  const meta = columns.filter((c, i) => i !== primary && c !== trailing && (c.mobile ?? 'meta') === 'meta');
  const primaryCol = columns[primary];

  return (
    <ul aria-label={label} className="divide-y divide-border">
      {rows.map((row) => {
        const href = getRowHref?.(row);
        const actions = rowActions?.(row) ?? [];
        const metaValues = meta
          .map((c) => ({ id: c.id, node: (c.mobileCell ?? c.cell)(row) }))
          .filter((m) => !isBlank(m.node));
        const trailingNode = trailing ? (trailing.mobileCell ?? trailing.cell)(row) : null;
        const opens = Boolean(href || onRowClick);

        const body = (
          <>
            {leading?.(row)}
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex min-w-0 items-start justify-between gap-3">
                {/* Hasta dos líneas y luego elipsis: títulos con el mismo prefijo
                    («Consentimiento informado para…») o nombres de archivo largos
                    se distinguen por el final. */}
                <span data-slot="primary" className="line-clamp-2 min-w-0 break-words text-[15px] font-semibold leading-snug text-ink">
                  {(primaryCol.mobileCell ?? primaryCol.cell)(row)}
                </span>
                {!isBlank(trailingNode) ? (
                  <span className="shrink-0 text-sm text-ink tabular-nums">{trailingNode}</span>
                ) : null}
              </span>
              {metaValues.length > 0 ? (
                // La línea 2 se parte en vez de recortarse: lleva identificadores
                // (documento, teléfono) que con elipsis dejarían de leerse.
                <span className="break-words text-[13px] leading-snug text-muted tabular-nums">
                  {metaValues.map((m, i) => (
                    <React.Fragment key={m.id}>
                      {i > 0 ? <span aria-hidden> · </span> : null}
                      {m.node}
                    </React.Fragment>
                  ))}
                </span>
              ) : null}
            </span>
            {opens ? <ChevronRight aria-hidden className="size-4 shrink-0 text-muted" /> : null}
          </>
        );

        // Toda la tarjeta es el objetivo (≥56px), salvo el «⋯», que va FUERA
        // del enlace: un botón dentro de un enlace no es HTML válido y el
        // toque abriría la ficha en vez del menú.
        const targetClass = cn(
          'flex min-h-14 min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left',
          actions.length > 0 ? 'pr-1' : 'pr-4',
          opens &&
            'transition-colors hover:bg-surface-sunken active:bg-surface-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-text',
        );

        return (
          <li key={getRowKey(row)} className="flex items-center">
            {href ? (
              <Link href={href} className={targetClass}>
                {body}
              </Link>
            ) : onRowClick ? (
              <button type="button" onClick={() => onRowClick(row)} className={targetClass}>
                {body}
              </button>
            ) : (
              <div className={targetClass}>{body}</div>
            )}
            {actions.length > 0 ? (
              <div className="shrink-0 pr-2">
                <RowActions label={actionsLabel(row, getRowLabel)} actions={actions} className="size-11" />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
