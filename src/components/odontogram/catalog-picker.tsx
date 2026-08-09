'use client';
import { useState } from 'react';
import type { DentalCatalogItem } from '@/lib/odontogram/catalog-api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

// Copy as constants (i18n-ready, es-first) — matches tooth-record-panel.tsx,
// where this picker used to live inline.
const copy = {
  filterLabel: 'Buscar en el catálogo',
  defaultFilterPlaceholder: 'Caries, resina, corona…',
  noMatches: (query: string) => `Ningún ítem del catálogo coincide con "${query}".`,
  kindLabels: { DIAGNOSIS: 'Diagnóstico', PROCEDURE: 'Procedimiento' } as const,
};

interface CatalogPickerProps {
  items: DentalCatalogItem[];
  /** The selected catalog item's id, or `null` for "nothing chosen yet". */
  value: string | null;
  onChange: (catalogItemId: string) => void;
  /**
   * Namespaces the generated element ids AND the radio group's `name`, so two
   * pickers can coexist on one page without stealing each other's selection.
   */
  idPrefix: string;
  /** The `<legend>` — each consumer names the choice in its own terms. */
  legend: string;
  /** Placeholder of the filter box; defaults to a mixed diagnóstico/procedimiento example. */
  filterPlaceholder?: string;
  /**
   * Whether each row carries its DIAGNOSIS/PROCEDURE tag. The odontogram lists
   * both kinds and needs the distinction; a treatment-plan item can only be a
   * PROCEDURE, where the tag would repeat on every row and say nothing.
   */
  showKind?: boolean;
}

/**
 * The catalog chooser shared by the odontogram's `ToothRecordPanel` and the
 * treatment plan's "Agregar ítem" form: a filter box over a scrollable list of
 * radios, each with the item's color swatch.
 *
 * It exists because the two surfaces had drifted apart — the odontogram had
 * this filtered list while the plan (the surface where the choice becomes a
 * charge) had a bare native `<select>` over the whole ~100-item catalog. The
 * filter is not a nicety: the seeded catalog is taller than the viewport, so
 * without it picking an item means scrolling a list of a hundred radios.
 *
 * The query state is local: it is a view over the list, never part of the
 * value the form submits, so a consumer resetting its form doesn't need to
 * know this exists.
 */
export function CatalogPicker({
  items,
  value,
  onChange,
  idPrefix,
  legend,
  filterPlaceholder = copy.defaultFilterPlaceholder,
  showKind = true,
}: CatalogPickerProps) {
  const [query, setQuery] = useState('');

  const normalized = query.trim().toLowerCase();
  const visible = normalized
    ? items.filter(
        (item) =>
          item.labelEs.toLowerCase().includes(normalized) ||
          item.code.toLowerCase().includes(normalized),
      )
    : items;

  return (
    <fieldset className="flex min-w-0 flex-col gap-2.5">
      <legend className="t-label mb-0.5 text-muted">{legend}</legend>
      <Label htmlFor={`${idPrefix}-filter`} className="sr-only">
        {copy.filterLabel}
      </Label>
      <Input
        id={`${idPrefix}-filter`}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={filterPlaceholder}
      />
      {visible.length === 0 ? (
        <p role="status" className="py-2 text-sm text-muted">
          {copy.noMatches(query.trim())}
        </p>
      ) : (
        <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
          {visible.map((item) => (
            <label
              key={item.id}
              htmlFor={`${idPrefix}-${item.id}`}
              className={cn(
                'flex cursor-pointer items-center gap-2 border-b border-hairline px-3 py-2 text-sm text-ink last:border-0 transition-colors hover:bg-surface-2',
                value === item.id && 'bg-surface-2',
              )}
            >
              <input
                id={`${idPrefix}-${item.id}`}
                type="radio"
                name={`${idPrefix}-item`}
                value={item.id}
                checked={value === item.id}
                onChange={() => onChange(item.id)}
              />
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-[3px] border border-border"
                style={{ backgroundColor: item.color }}
              />
              <span className="min-w-0 flex-1 truncate">{item.labelEs}</span>
              {showKind ? (
                <span className="t-label shrink-0 text-muted">{copy.kindLabels[item.kind]}</span>
              ) : null}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}
