'use client';

import type { DentalCatalogItem } from '@/lib/odontogram/catalog-api';
import { ORIGIN_LABELS, ORIGIN_ORDER, ORIGIN_PATTERN_ID } from '@/lib/odontogram/origin';

// Copy as constants (i18n-ready, es-first) — matches odontogram-chart.tsx /
// tooth.tsx convention until next-intl wiring lands.
const copy = {
  title: 'Referencias del odontograma',
  originTitle: 'Origen de los registros',
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
 *
 * DX-120: below it, always, the ORIGIN key — the catalog color says WHAT was
 * recorded, the overlay says WHO did it: plain = done in this clinic,
 * diagonal hatch = already present, dots = another provider. The overlay
 * patterns are defined once next to the chart (`OriginPatterns`).
 */
export function OdontogramLegend({ items }: OdontogramLegendProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {items.length > 0 ? (
        <ul aria-label={copy.title} className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5">
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
      ) : null}
      <ul aria-label={copy.originTitle} className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5">
        {ORIGIN_ORDER.map((origin) => (
          <li key={origin} className="inline-flex items-center gap-1.5 text-xs">
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" className="shrink-0">
              <rect
                x="0.5"
                y="0.5"
                width="11"
                height="11"
                rx="2"
                className="fill-surface-2 stroke-muted"
                strokeWidth="1"
              />
              {origin !== 'THIS_CLINIC' ? (
                <rect x="0.5" y="0.5" width="11" height="11" rx="2" fill={`url(#${ORIGIN_PATTERN_ID[origin]})`} />
              ) : null}
            </svg>
            <span className="text-muted">{ORIGIN_LABELS[origin]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
