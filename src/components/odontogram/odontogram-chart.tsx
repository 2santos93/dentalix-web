'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { PERMANENT_LOWER, PERMANENT_UPPER } from '@/lib/odontogram/fdi';
import type { ToothSurface } from '@/lib/odontogram/odontogram-api';
import type { ToothState } from '@/lib/odontogram/projection';
import { toothChartSide } from '@/lib/odontogram/tooth-anatomy';
import { Tooth } from './tooth';

// Copy as constants (i18n-ready, es-first) — matches patients-table.tsx convention.
const copy = {
  chartLabel: 'Odontograma',
  upperRow: 'Arcada superior',
  lowerRow: 'Arcada inferior',
  // Quadrants are named from the patient's point of view; the chart is drawn
  // facing them, so quadrant 1 (their upper right) is the chart's upper LEFT.
  quadrant1: 'Superior derecho · 1',
  quadrant2: 'Superior izquierdo · 2',
  quadrant3: 'Inferior izquierdo · 3',
  quadrant4: 'Inferior derecho · 4',
  keyboardHint:
    'Usa las flechas para moverte entre dientes y Enter para seleccionar el diente enfocado. Las caras se eligen en el formulario de registro.',
};

const UPPER_LEFT_HALF = PERMANENT_UPPER.filter((fdi) => toothChartSide(fdi) === 'left');
const UPPER_RIGHT_HALF = PERMANENT_UPPER.filter((fdi) => toothChartSide(fdi) === 'right');
const LOWER_LEFT_HALF = PERMANENT_LOWER.filter((fdi) => toothChartSide(fdi) === 'left');
const LOWER_RIGHT_HALF = PERMANENT_LOWER.filter((fdi) => toothChartSide(fdi) === 'right');

/**
 * The tooth the arrow keys would move to next, or `null` for a key this chart
 * doesn't handle. The two arches are the two rows: left/right walk along a row
 * (clamped at the ends, never wrapping into the other quadrant), up/down cross
 * to the same column of the other arch, Home/End jump to the row's ends.
 */
export function nextToothForKey(current: string, key: string): string | null {
  const inUpper = PERMANENT_UPPER.includes(current);
  const row = inUpper ? PERMANENT_UPPER : PERMANENT_LOWER;
  const index = row.indexOf(current);
  if (index === -1) return null;

  switch (key) {
    case 'ArrowLeft':
      return row[Math.max(0, index - 1)];
    case 'ArrowRight':
      return row[Math.min(row.length - 1, index + 1)];
    case 'ArrowUp':
      return inUpper ? null : PERMANENT_UPPER[index];
    case 'ArrowDown':
      return inUpper ? PERMANENT_LOWER[index] : null;
    case 'Home':
      return row[0];
    case 'End':
      return row[row.length - 1];
    default:
      return null;
  }
}

interface OdontogramChartProps {
  states: Map<string, ToothState>;
  catalogById?: Map<string, { color: string }>;
  selectedTooth?: string;
  onSelectTooth: (toothNumber: string) => void;
  onSelectSurface: (toothNumber: string, surface: ToothSurface) => void;
}

/**
 * The 32 permanent teeth on a paper field: two arches meeting at the occlusal
 * plane, split by the midline, with each quadrant labelled — the structure of
 * a printed dental chart rather than a grid of equal squares. Teeth carry their
 * anatomical width and surface orientation (see `tooth-anatomy.ts`).
 *
 * Keyboard: the chart is a single tab stop (roving tabindex) and the arrow keys
 * move between teeth, so a keyboard user reaches the rest of the page in one
 * Tab instead of 192.
 *
 * Wrapped in `overflow-x-auto` so narrow (mobile) viewports scroll horizontally
 * instead of squeezing/breaking the chart.
 */
export function OdontogramChart({
  states,
  catalogById,
  selectedTooth,
  onSelectTooth,
  onSelectSurface,
}: OdontogramChartProps) {
  // `null` until the user interacts: the active (tabbable) tooth then falls
  // back to the selected one, or to the first tooth of the upper arch. Kept as
  // a derived value instead of an effect syncing state to `selectedTooth`.
  const [activeTooth, setActiveTooth] = useState<string | null>(null);
  const active = activeTooth ?? selectedTooth ?? PERMANENT_UPPER[0];
  const buttons = useRef(new Map<string, HTMLButtonElement>());

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const next = nextToothForKey(active, event.key);
    if (!next) return;
    event.preventDefault();
    setActiveTooth(next);
    buttons.current.get(next)?.focus();
  }

  function renderTooth(fdi: string, placement: 'above' | 'below') {
    return (
      <Tooth
        key={fdi}
        toothNumber={fdi}
        state={states.get(fdi)}
        catalogById={catalogById}
        selected={selectedTooth === fdi}
        numberPlacement={placement}
        tabbable={active === fdi}
        onFocusTooth={() => setActiveTooth(fdi)}
        registerRef={(el) => {
          if (el) buttons.current.set(fdi, el);
          else buttons.current.delete(fdi);
        }}
        onSelectTooth={() => {
          setActiveTooth(fdi);
          onSelectTooth(fdi);
        }}
        onSelectSurface={(surface) => {
          setActiveTooth(fdi);
          onSelectSurface(fdi, surface);
        }}
      />
    );
  }

  return (
    <div role="group" aria-label={copy.chartLabel} className="overflow-x-auto">
      <p className="sr-only">{copy.keyboardHint}</p>
      {/* The paper field: the chart is drawn on the app's paper tone, inset in
          a surface-level page, the way a form sits on a clinical record. */}
      <div
        onKeyDown={handleKeyDown}
        // `w-fit` para que el campo mida lo que miden las arcadas: así la línea
        // media, el plano oclusal y los rótulos de cuadrante enmarcan el dibujo
        // en vez de estirarse a todo el ancho de la página.
        className="w-fit min-w-max rounded-xl border border-border bg-bg px-4 py-3 sm:px-6 sm:py-4"
      >
        <QuadrantCaptions left={copy.quadrant1} right={copy.quadrant2} />

        <div role="row" aria-label={copy.upperRow} className="flex items-end">
          <div className="flex items-end gap-1 pr-3 sm:pr-4">
            {UPPER_LEFT_HALF.map((fdi) => renderTooth(fdi, 'above'))}
          </div>
          {/* Midline. */}
          <div className="flex items-end gap-1 border-l border-border pl-3 sm:pl-4">
            {UPPER_RIGHT_HALF.map((fdi) => renderTooth(fdi, 'above'))}
          </div>
        </div>

        {/* Occlusal plane — the horizontal rule the two arches sit against. */}
        <div aria-hidden className="my-2 border-t border-border" />

        <div role="row" aria-label={copy.lowerRow} className="flex items-start">
          <div className="flex items-start gap-1 pr-3 sm:pr-4">
            {LOWER_LEFT_HALF.map((fdi) => renderTooth(fdi, 'below'))}
          </div>
          <div className="flex items-start gap-1 border-l border-border pl-3 sm:pl-4">
            {LOWER_RIGHT_HALF.map((fdi) => renderTooth(fdi, 'below'))}
          </div>
        </div>

        <QuadrantCaptions left={copy.quadrant4} right={copy.quadrant3} />
      </div>
    </div>
  );
}

/**
 * The quadrant names, pinned to the field's outer corners so they frame the
 * arch without competing with the teeth.
 */
function QuadrantCaptions({ left, right }: { left: string; right: string }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-muted">
      <span className="t-label">{left}</span>
      <span className="t-label">{right}</span>
    </div>
  );
}
