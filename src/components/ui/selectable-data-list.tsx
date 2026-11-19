'use client';
import * as React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { DataList, type DataListProps } from '@/components/ui/data-list';

/**
 * Selección múltiple (DX-465): una casilla por fila y «Seleccionar todo» de las
 * filas que se ven (la página). La lista no guarda nada: quien la usa tiene el
 * conjunto y pinta la barra de acciones. Casillas nativas: Espacio las marca.
 */
export interface DataListSelection<T> {
  /** Las claves (`getRowKey`) marcadas; puede tener claves de filas que ya no se ven. */
  selectedKeys: ReadonlySet<string>;
  onChange: (next: ReadonlySet<string>) => void;
  /** Nombre accesible de la casilla de la fila: «Seleccionar a Ana Pérez». */
  getRowLabel: (row: T) => string;
  /** Nombre de la casilla de cabecera: «Seleccionar todos los de esta página». */
  allLabel: string;
}

function withKey(selected: ReadonlySet<string>, keys: readonly string[], checked: boolean): ReadonlySet<string> {
  const next = new Set(selected);
  for (const k of keys) {
    if (checked) next.add(k);
    else next.delete(k);
  }
  return next;
}

/**
 * `DataList` con casillas (DX-465). Vive aparte para que el shell, que carga
 * `DataList` en todas las rutas, no pague `Checkbox` ni esta lógica: solo la
 * importa la pantalla que selecciona (la lista de recall).
 */
export function SelectableDataList<T>({ selection, ...props }: DataListProps<T> & { selection: DataListSelection<T> }) {
  const { rows, getRowKey } = props;
  const keys = rows.map(getRowKey);
  const marked = keys.filter((k) => selection.selectedKeys.has(k)).length;
  const all = keys.length > 0 && marked === keys.length;
  const some = marked > 0 && marked < keys.length;

  const selectAll = (label?: React.ReactNode) => (
    <Checkbox
      aria-label={label ? undefined : selection.allLabel}
      label={label}
      checked={all}
      indeterminate={some}
      disabled={keys.length === 0}
      onChange={(e) => selection.onChange(withKey(selection.selectedKeys, keys, e.target.checked))}
    />
  );

  return (
    <DataList
      {...props}
      checkboxes={{
        header: selectAll(),
        phoneHeader: selectAll(selection.allLabel),
        isSelected: (row) => selection.selectedKeys.has(getRowKey(row)),
        cell: (row) => {
          const key = getRowKey(row);
          return (
            <Checkbox
              aria-label={selection.getRowLabel(row)}
              checked={selection.selectedKeys.has(key)}
              onChange={(e) => selection.onChange(withKey(selection.selectedKeys, [key], e.target.checked))}
            />
          );
        },
      }}
    />
  );
}
