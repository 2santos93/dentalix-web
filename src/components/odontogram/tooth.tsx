'use client';

import type { KeyboardEvent } from 'react';
import type { ToothRecord, ToothSurface } from '@/lib/odontogram/odontogram-api';
import type { ToothState } from '@/lib/odontogram/projection';
import { TOOTH_HEIGHT, toothTransform, toothWidth } from '@/lib/odontogram/tooth-anatomy';
import { cn } from '@/lib/utils';

/**
 * SVG anatomy: a 40×40 viewBox "envelope" — the center 16×16 square is the
 * occlusal surface and the 4 surrounding trapezoids are vestibular (top),
 * lingual (bottom), mesial (left) and distal (right). That geometry is
 * authored ONCE, in quadrant 2's orientation, and `toothTransform` mirrors it
 * per quadrant so vestibular always faces away from the occlusal plane and
 * mesial always faces the midline (see `tooth-anatomy.ts`). The box is then
 * stretched to the tooth's anatomical width with `preserveAspectRatio="none"`;
 * `vector-effect: non-scaling-stroke` keeps every outline at 1px so a narrow
 * incisor doesn't render a thinner line than a molar.
 *
 * Anterior teeth use "oclusal" for their center surface too, matching the
 * `ToothSurface` enum the API stores and the record form's own checkbox — the
 * clinically precise "incisal" would have to change the shared vocabulary in
 * both places at once, so it stays a follow-up rather than a chart-only rename.
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
  allSurfaces: 'todas las caras',
  surfaceList: (surfaces: string[]) =>
    `cara${surfaces.length === 1 ? '' : 's'} ${joinEs(surfaces)}`,
  toothLabel: (fdi: string, summary: string) => `Diente ${fdi}, ${summary}`,
};

/** "a, b y c" — the Spanish conjunction, with no comma before the "y". */
function joinEs(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

/**
 * Everything a screen reader hears about a tooth, in ONE string: the record
 * count plus which faces carry them. The 5 surface regions are `aria-hidden`
 * (see below), so this label is the only place their state is announced —
 * "3 registros, caras vestibular, mesial y oclusal" instead of the same fact
 * spread over five separate stops in the virtual buffer.
 *
 * A whole-tooth record (empty `surfaces[]`, e.g. an extraction) paints every
 * face, so it announces as "todas las caras" rather than listing all five.
 */
function toothSummary(state?: ToothState): string {
  if (!state?.hasRecords) return copy.healthy;

  const count = copy.withRecords(state.records.length);
  if (state.wholeToothRecord) return `${count}, ${copy.allSurfaces}`;

  const affected = SURFACE_ORDER.filter((surface) => state.surfaceState[surface]).map(
    (surface) => SURFACE_LABELS[surface],
  );
  // Defensive: a record either lists surfaces or is whole-tooth, so this only
  // fires if the projection ever hands us a third shape — the count still reads.
  if (affected.length === 0) return count;

  return `${count}, ${copy.surfaceList(affected)}`;
}

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
  /**
   * Where the FDI number sits relative to the crown. The chart puts it on the
   * arch's OUTER edge (above the upper arch, below the lower one) so both rows
   * of crowns meet at the occlusal plane, the way a printed chart reads.
   */
  numberPlacement?: 'above' | 'below';
  /**
   * Roving tabindex: exactly ONE tooth in the chart is tabbable at a time and
   * the arrow keys move between them (see `OdontogramChart`). Without this the
   * chart would spend 32 tab stops — 192 with the surfaces — before the rest
   * of the page.
   */
  tabbable?: boolean;
  onFocusTooth?: () => void;
  registerRef?: (el: HTMLButtonElement | null) => void;
  onSelectTooth: () => void;
  onSelectSurface: (surface: ToothSurface) => void;
}

export function Tooth({
  toothNumber,
  state,
  catalogById,
  selected = false,
  numberPlacement = 'below',
  tabbable = false,
  onFocusTooth,
  registerRef,
  onSelectTooth,
  onSelectSurface,
}: ToothProps) {
  const wholeToothColor = resolveRecordColor(state?.wholeToothRecord ?? null, catalogById);
  const summary = toothSummary(state);

  function handleSurfaceKeyDown(event: KeyboardEvent<SVGPolygonElement>, surface: ToothSurface) {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      onSelectSurface(surface);
    }
  }

  const number = (
    <button
      type="button"
      ref={registerRef}
      tabIndex={tabbable ? 0 : -1}
      aria-pressed={selected}
      onClick={onSelectTooth}
      onFocus={onFocusTooth}
      className={cn(
        'min-w-6 rounded px-1 text-xs font-medium tabular-nums transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-bg',
        selected ? 'bg-primary text-primary-foreground' : 'text-ink hover:bg-surface-2',
      )}
    >
      {toothNumber}
    </button>
  );

  return (
    <div className="flex flex-col items-center gap-1">
      {numberPlacement === 'above' && number}
      <svg
        viewBox="0 0 40 40"
        width={toothWidth(toothNumber)}
        height={TOOTH_HEIGHT}
        preserveAspectRatio="none"
        role="group"
        aria-label={copy.toothLabel(toothNumber, summary)}
        className="overflow-visible"
      >
        <g transform={toothTransform(toothNumber)}>
          {SURFACE_ORDER.map((surface) => {
            const record = state?.surfaceState[surface] ?? null;
            const color = resolveRecordColor(record, catalogById) ?? wholeToothColor;
            return (
              <polygon
                key={surface}
                points={SURFACE_SHAPES[surface]}
                // Hidden from the accessibility tree on purpose: exposing each
                // face as its own button put 160 extra stops in the screen
                // reader's virtual buffer (32 teeth × 5 faces) BEFORE the
                // legend, and every one of them repeated the tooth's number.
                // Their state now rides in the tooth's own `aria-label`
                // (`toothSummary`), which is one stop and one sentence.
                //
                // Pointer targets all the same: clicking a face still selects
                // it, and the keydown below keeps working if something moves
                // focus here programmatically. `tabIndex={-1}` is not tabbable,
                // so `aria-hidden` here doesn't strand a keyboard user.
                aria-hidden="true"
                tabIndex={-1}
                // Names the region in the DOM now that it carries no label —
                // the handle for tests, e2e and devtools.
                data-surface={surface}
                onClick={() => onSelectSurface(surface)}
                onKeyDown={(event) => handleSurfaceKeyDown(event, surface)}
                className="cursor-pointer fill-surface stroke-muted transition-colors hover:stroke-primary focus:outline-none focus-visible:stroke-primary"
                style={color ? { fill: color } : undefined}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
          {/* Crown outline: the surface divisions are drawn at the muted weight
              and the perimeter one step stronger, so the mark reads as a tooth
              crown with its faces instead of a grid of equal boxes. */}
          <rect
            x={0}
            y={0}
            width={40}
            height={40}
            rx={2}
            className="pointer-events-none fill-none stroke-ink"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        </g>
        {selected && (
          <rect
            x={0.5}
            y={0.5}
            width={39}
            height={39}
            className="pointer-events-none fill-none stroke-primary"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {numberPlacement === 'below' && number}
    </div>
  );
}
