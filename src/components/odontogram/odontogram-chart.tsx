'use client';

import { PERMANENT_LOWER, PERMANENT_UPPER } from '@/lib/odontogram/fdi';
import type { ToothSurface } from '@/lib/odontogram/odontogram-api';
import type { ToothState } from '@/lib/odontogram/projection';
import { Tooth } from './tooth';

// Copy as constants (i18n-ready, es-first) — matches patients-table.tsx convention.
const copy = {
  chartLabel: 'Odontograma',
  upperRow: 'Arcada superior',
  lowerRow: 'Arcada inferior',
};

interface OdontogramChartProps {
  states: Map<string, ToothState>;
  catalogById?: Map<string, { color: string }>;
  selectedTooth?: string;
  onSelectTooth: (toothNumber: string) => void;
  onSelectSurface: (toothNumber: string, surface: ToothSurface) => void;
}

/**
 * Composes the 32 permanent-dentition teeth in the standard FDI two-row
 * layout (upper 18→11 | 21→28, lower 48→41 | 31→38 — see fdi.ts). Wrapped
 * in `overflow-x-auto` so narrow (mobile) viewports scroll horizontally
 * instead of squeezing/breaking the chart.
 */
export function OdontogramChart({
  states,
  catalogById,
  selectedTooth,
  onSelectTooth,
  onSelectSurface,
}: OdontogramChartProps) {
  return (
    <div role="group" aria-label={copy.chartLabel} className="overflow-x-auto">
      <div className="flex min-w-max flex-col gap-6 rounded-lg border border-border bg-surface p-4">
        <div role="row" aria-label={copy.upperRow} className="flex gap-1">
          {PERMANENT_UPPER.map((fdi) => (
            <Tooth
              key={fdi}
              toothNumber={fdi}
              state={states.get(fdi)}
              catalogById={catalogById}
              selected={selectedTooth === fdi}
              onSelectTooth={() => onSelectTooth(fdi)}
              onSelectSurface={(surface) => onSelectSurface(fdi, surface)}
            />
          ))}
        </div>
        <div role="row" aria-label={copy.lowerRow} className="flex gap-1">
          {PERMANENT_LOWER.map((fdi) => (
            <Tooth
              key={fdi}
              toothNumber={fdi}
              state={states.get(fdi)}
              catalogById={catalogById}
              selected={selectedTooth === fdi}
              onSelectTooth={() => onSelectTooth(fdi)}
              onSelectSurface={(surface) => onSelectSurface(fdi, surface)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
