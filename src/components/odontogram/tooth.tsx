'use client';

import type { KeyboardEvent } from 'react';
import type { ToothRecord, ToothSurface } from '@/lib/odontogram/odontogram-api';
import type { ToothState } from '@/lib/odontogram/projection';

/**
 * SVG anatomy (documented orientation — see task-2b-5-report.md for the
 * full rationale): a 40×40 viewBox "envelope" chart. The center 16×16
 * square is OCCLUSAL (incisal for anterior teeth in a future refinement;
 * v1 uses the same label for all 32 permanent teeth). The 4 surrounding
 * trapezoids are, in a FIXED screen orientation regardless of quadrant:
 * top = VESTIBULAR, bottom = LINGUAL, left = MESIAL, right = DISTAL.
 * This is a v1 simplification — MESIAL/DISTAL anatomically flip sides
 * between the left and right hemi-arches (mesial always faces the
 * midline), but a fixed left/right mapping is acceptable for v1 per the
 * task brief and is documented here rather than silently assumed.
 */
const SURFACE_LABELS: Record<ToothSurface, string> = {
  VESTIBULAR: 'vestibular',
  LINGUAL: 'lingual',
  MESIAL: 'mesial',
  DISTAL: 'distal',
  OCCLUSAL: 'oclusal',
};

const SURFACE_SHAPES: Record<ToothSurface, string> = {
  VESTIBULAR: '0,0 40,0 28,12 12,12',
  LINGUAL: '0,40 40,40 28,28 12,28',
  MESIAL: '0,0 12,12 12,28 0,40',
  DISTAL: '40,0 28,12 28,28 40,40',
  OCCLUSAL: '12,12 28,12 28,28 12,28',
};

// Render order top→left→center→right→bottom, purely cosmetic (SVG paints
// in document order; none of these regions overlap so order has no visual
// effect beyond stacking at shared edges).
const SURFACE_ORDER: ToothSurface[] = ['VESTIBULAR', 'MESIAL', 'OCCLUSAL', 'DISTAL', 'LINGUAL'];

// Copy as constants (i18n-ready, es-first) — matches patients-table.tsx convention.
const copy = {
  healthy: 'sano',
  withRecords: (count: number) => `${count} registro${count === 1 ? '' : 's'}`,
  toothLabel: (fdi: string, summary: string) => `Diente ${fdi}, ${summary}`,
  surfaceLabel: (fdi: string, surface: string, summary: string) => `Diente ${fdi}, cara ${surface}, ${summary}`,
  surfaceHealthy: 'sana',
  surfaceWithRecord: 'con registro',
};

function resolveRecordColor(
  record: ToothRecord | null | undefined,
  catalogById?: Map<string, { color: string }>,
): string | null {
  if (!record?.catalogItemId) return null;
  return catalogById?.get(record.catalogItemId)?.color ?? null;
}

interface ToothProps {
  toothNumber: string;
  state?: ToothState;
  catalogById?: Map<string, { color: string }>;
  selected?: boolean;
  onSelectTooth: () => void;
  onSelectSurface: (surface: ToothSurface) => void;
}

export function Tooth({
  toothNumber,
  state,
  catalogById,
  selected = false,
  onSelectTooth,
  onSelectSurface,
}: ToothProps) {
  const wholeToothColor = resolveRecordColor(state?.wholeToothRecord ?? null, catalogById);
  const toothSummary = state?.hasRecords ? copy.withRecords(state.records.length) : copy.healthy;

  function handleSurfaceKeyDown(event: KeyboardEvent<SVGPolygonElement>, surface: ToothSurface) {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      onSelectSurface(surface);
    }
  }

  function handleToothKeyDown(event: KeyboardEvent<HTMLSpanElement>) {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      onSelectTooth();
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <svg
        viewBox="0 0 40 40"
        width={40}
        height={40}
        role="group"
        aria-label={copy.toothLabel(toothNumber, toothSummary)}
        className="overflow-visible"
      >
        {SURFACE_ORDER.map((surface) => {
          const record = state?.surfaceState[surface] ?? null;
          const color = resolveRecordColor(record, catalogById) ?? wholeToothColor;
          const hasRecord = Boolean(record) || Boolean(state?.wholeToothRecord);
          return (
            <polygon
              key={surface}
              points={SURFACE_SHAPES[surface]}
              role="button"
              tabIndex={0}
              aria-label={copy.surfaceLabel(
                toothNumber,
                SURFACE_LABELS[surface],
                hasRecord ? copy.surfaceWithRecord : copy.surfaceHealthy,
              )}
              onClick={() => onSelectSurface(surface)}
              onKeyDown={(event) => handleSurfaceKeyDown(event, surface)}
              className="cursor-pointer fill-surface stroke-muted transition-colors hover:opacity-80 focus:outline-none focus-visible:stroke-primary"
              style={color ? { fill: color } : undefined}
              strokeWidth={1}
            />
          );
        })}
        {selected && (
          <rect
            x={0.5}
            y={0.5}
            width={39}
            height={39}
            rx={2}
            className="pointer-events-none fill-none stroke-primary"
            strokeWidth={2}
          />
        )}
      </svg>
      <span
        role="button"
        tabIndex={0}
        onClick={onSelectTooth}
        onKeyDown={handleToothKeyDown}
        className={`cursor-pointer text-xs font-medium tabular-nums ${selected ? 'text-primary' : 'text-ink'}`}
      >
        {toothNumber}
      </span>
    </div>
  );
}
