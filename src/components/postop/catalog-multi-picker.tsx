'use client';
import { useState } from 'react';
import type { DentalCatalogItem } from '@/lib/odontogram/catalog-api';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const copy = {
  filterLabel: 'Buscar procedimiento',
  defaultFilterPlaceholder: 'Exodoncia, endodoncia, implante…',
  noMatches: (query: string) => `Ningún procedimiento coincide con «${query}».`,
  noItems: 'No hay procedimientos activos en el catálogo.',
  retired: 'Retirado',
  selected: (n: number) => (n === 1 ? '1 seleccionado' : `${n} seleccionados`),
};

/** Lo mínimo que se pinta de un ítem. Un vínculo a un ítem ya inactivo llega sin color. */
export type CatalogMultiPickerItem = Pick<DentalCatalogItem, 'id' | 'code' | 'labelEs'> & {
  color?: string;
  /** Vínculo conservado a un procedimiento ausente del catálogo activo. */
  retired?: boolean;
};

interface CatalogMultiPickerProps {
  items: CatalogMultiPickerItem[];
  /** Ids marcados, en el orden en que se marcaron. */
  value: string[];
  onChange: (catalogItemIds: string[]) => void;
  /** Prefijo de los ids generados: dos selectores pueden convivir en una página. */
  idPrefix: string;
  legend: string;
  filterPlaceholder?: string;
}

/** Sin tildes ni mayúsculas: «exodóncia» encuentra «Exodoncia». */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Selección múltiple sobre el catálogo (DX-222): la variante de casillas de
 * `CatalogPicker`. Un filtro sobre una lista desplazable de checkboxes nativos;
 * filtrar es solo una vista y no desmarca lo que queda oculto.
 */
export function CatalogMultiPicker({
  items,
  value,
  onChange,
  idPrefix,
  legend,
  filterPlaceholder = copy.defaultFilterPlaceholder,
}: CatalogMultiPickerProps) {
  const [query, setQuery] = useState('');

  const needle = normalize(query.trim());
  const visible = needle
    ? items.filter(
        (item) => normalize(item.labelEs).includes(needle) || normalize(item.code).includes(needle),
      )
    : items;
  const selected = new Set(value);

  function toggle(id: string) {
    onChange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  return (
    <fieldset className="flex min-w-0 flex-col gap-2.5">
      <legend className="t-label mb-0.5 text-ink">{legend}</legend>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{copy.noItems}</p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={`${idPrefix}-filter`} className="sr-only">
              {copy.filterLabel}
            </Label>
            <Input
              id={`${idPrefix}-filter`}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              // El selector vive dentro del <form> de la plantilla: Enter aquí
              // filtra, no envía (ni crea ni guarda a medio elegir).
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.preventDefault();
              }}
              placeholder={filterPlaceholder}
              className="min-w-0 flex-1"
            />
            <span className="t-caption t-data shrink-0 text-muted" aria-live="polite">
              {copy.selected(value.length)}
            </span>
          </div>
          {visible.length === 0 ? (
            <p role="status" className="py-2 text-sm text-muted">
              {copy.noMatches(query.trim())}
            </p>
          ) : (
            <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
              {visible.map((item) => {
                const id = `${idPrefix}-${item.id}`;
                const checked = selected.has(item.id);
                return (
                  <Checkbox
                    key={item.id}
                    id={id}
                    checked={checked}
                    disabled={item.retired}
                    onChange={() => toggle(item.id)}
                    className="items-center border-b border-border-subtle px-3 py-2.5 transition-colors last:border-0 hover:bg-surface-sunken has-checked:bg-surface-sunken"
                    label={
                      <span className="flex min-w-0 items-center gap-2">
                        {item.color ? (
                          <span
                            aria-hidden="true"
                            className="size-2.5 shrink-0 rounded-[3px] border border-border"
                            style={{ backgroundColor: item.color }}
                          />
                        ) : null}
                        {/* Se parte en vez de recortarse: a 390 px el nombre más largo no
                            debe ensanchar el diálogo ni quedar ilegible. */}
                        <span className="min-w-0 [overflow-wrap:anywhere]">{item.labelEs}</span>
                        {item.retired ? (
                          <span className="t-caption shrink-0 text-muted">{copy.retired}</span>
                        ) : null}
                        <span className="t-id t-caption shrink-0 text-muted">{item.code}</span>
                      </span>
                    }
                  />
                );
              })}
            </div>
          )}
        </>
      )}
    </fieldset>
  );
}
