'use client';

import type { DentalCatalogItem } from '@/lib/odontogram/catalog-api';

// Copy as constants (i18n-ready, es-first) — matches odontogram-chart.tsx /
// tooth.tsx convention until next-intl wiring lands.
const copy = {
  title: 'Referencias del odontograma',
};

interface OdontogramLegendProps {
  /**
   * The distinct catalog items actually present on this patient's chart — so
   * the legend explains the colors that are ON SCREEN, not the whole catalog.
   * The caller derives these from the odontogram's records (see `OdontogramTab`).
   */
  items: DentalCatalogItem[];
}

/**
 * A compact, clinical color key for the odontogram: one swatch + label per
 * catalog item currently painted on the chart. Colors come only from the
 * catalog tokens (per DESIGN.md's "Odontogram (signature)"), never hardcoded.
 * Renders nothing when the chart is all-healthy (no records yet).
 */
export function OdontogramLegend({ items }: OdontogramLegendProps) {
  if (items.length === 0) return null;

  return (
    <ul
      aria-label={copy.title}
      className="flex flex-wrap items-center gap-x-4 gap-y-1.5"
    >
      {items.map((item) => (
        <li key={item.id} className="inline-flex items-center gap-1.5 text-xs">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-[3px] border border-border"
            style={{ backgroundColor: item.color }}
          />
          <span className="text-ink">{item.labelEs}</span>
        </li>
      ))}
    </ul>
  );
}
