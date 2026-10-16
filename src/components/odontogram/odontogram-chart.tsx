'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import type { ToothSurface } from '@/lib/odontogram/odontogram-api';
import type { ToothState } from '@/lib/odontogram/projection';
import {
  chartLayoutForArch,
  type ArchLayout,
  type ChartColumn,
  type DentitionType,
} from '@/lib/odontogram/dentition';
import { toothChartSide, toothWidth, type Arch } from '@/lib/odontogram/tooth-anatomy';
import { OriginPatterns } from './origin-patterns';
import { Tooth, UneruptedTooth } from './tooth';

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

/** Un diente navegable de la carta y su columna (0-15, de izquierda a derecha). */
interface NavCell {
  fdi: string;
  col: number;
}

/**
 * Filas navegables con el teclado, de arriba abajo: permanentes superiores,
 * temporales superiores, temporales inferiores, permanentes inferiores. Las
 * filas vacías (p. ej. sin temporales en un adulto) no existen.
 */
export function navigationRows(upper: ArchLayout, lower: ArchLayout): NavCell[][] {
  const permanentRow = (layout: ArchLayout) =>
    layout.columns.flatMap((c, col) => {
      const fdi = c.permanent ?? (c.unerupted ? c.position : null);
      return fdi ? [{ fdi, col }] : [];
    });
  const primaryRow = (layout: ArchLayout) =>
    layout.columns.flatMap((c, col) => (c.primary ? [{ fdi: c.primary, col }] : []));
  return [permanentRow(upper), primaryRow(upper), primaryRow(lower), permanentRow(lower)].filter(
    (row) => row.length > 0,
  );
}

/**
 * The tooth the arrow keys would move to next, or `null` for a key this chart
 * doesn't handle. Left/right walk along a row (clamped at the ends, never
 * wrapping), up/down cross to the nearest column of the row above/below (an
 * arch, or the primary row of a mixed dentition), Home/End jump to the row's
 * ends.
 */
export function nextToothForKey(current: string, key: string, rows: NavCell[][]): string | null {
  const rowIndex = rows.findIndex((row) => row.some((cell) => cell.fdi === current));
  if (rowIndex === -1) return null;
  const row = rows[rowIndex];
  const index = row.findIndex((cell) => cell.fdi === current);
  const nearestIn = (target: NavCell[] | undefined) => {
    if (!target) return null;
    const col = row[index].col;
    return target.reduce((best, cell) =>
      Math.abs(cell.col - col) < Math.abs(best.col - col) ? cell : best,
    ).fdi;
  };

  switch (key) {
    case 'ArrowLeft':
      return row[Math.max(0, index - 1)].fdi;
    case 'ArrowRight':
      return row[Math.min(row.length - 1, index + 1)].fdi;
    case 'ArrowUp':
      return nearestIn(rows[rowIndex - 1]);
    case 'ArrowDown':
      return nearestIn(rows[rowIndex + 1]);
    case 'Home':
      return row[0].fdi;
    case 'End':
      return row[row.length - 1].fdi;
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
  /**
   * DX-120: dentición de cada posición (código FDI permanente). Sin ella,
   * toda la boca es permanente — la carta de siempre.
   */
  dentitionOf?: (position: string) => DentitionType;
}

const ALL_PERMANENT_DENTITION = (): DentitionType => 'PERMANENT';

/**
 * The teeth on a paper field: two arches meeting at the occlusal plane, split
 * by the midline, with each quadrant labelled — the structure of a printed
 * dental chart rather than a grid of equal squares. Teeth carry their
 * anatomical width and surface orientation (see `tooth-anatomy.ts`).
 *
 * DX-120: each position is a COLUMN. Permanent teeth sit on the arch's outer
 * row and primary ones (51-85) on the inner row, next to the occlusal plane,
 * so a mixed position shows both teeth one above the other. A permanent molar
 * that hasn't erupted yet is a dashed slot. An all-permanent mouth has no
 * inner row at all.
 *
 * Keyboard: the chart is a single tab stop (roving tabindex) and the arrow keys
 * move between teeth, so a keyboard user reaches the rest of the page in one
 * Tab instead of 192.
 *
 * Wrapped in `overflow-x-auto` so narrow (mobile) viewports scroll the chart
 * inside its own frame instead of the page.
 */
export function OdontogramChart({
  states,
  catalogById,
  selectedTooth,
  onSelectTooth,
  onSelectSurface,
  dentitionOf = ALL_PERMANENT_DENTITION,
}: OdontogramChartProps) {
  const upper = chartLayoutForArch('upper', dentitionOf);
  const lower = chartLayoutForArch('lower', dentitionOf);
  const rows = navigationRows(upper, lower);
  const drawn = new Set(rows.flat().map((cell) => cell.fdi));

  // `null` until the user interacts: the active (tabbable) tooth then falls
  // back to the selected one (if it's drawn), or to the first tooth of the
  // top row. Kept as a derived value instead of an effect syncing state.
  const [activeTooth, setActiveTooth] = useState<string | null>(null);
  const active =
    (activeTooth && drawn.has(activeTooth) ? activeTooth : null) ??
    (selectedTooth && drawn.has(selectedTooth) ? selectedTooth : null) ??
    rows[0]?.[0]?.fdi;
  const buttons = useRef(new Map<string, HTMLButtonElement>());

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!active) return;
    const next = nextToothForKey(active, event.key, rows);
    if (!next) return;
    event.preventDefault();
    setActiveTooth(next);
    buttons.current.get(next)?.focus();
  }

  function common(fdi: string) {
    return {
      toothNumber: fdi,
      selected: selectedTooth === fdi,
      tabbable: active === fdi,
      onFocusTooth: () => setActiveTooth(fdi),
      registerRef: (el: HTMLButtonElement | null) => {
        if (el) buttons.current.set(fdi, el);
        else buttons.current.delete(fdi);
      },
      onSelectTooth: () => {
        setActiveTooth(fdi);
        onSelectTooth(fdi);
      },
    };
  }

  function renderTooth(fdi: string, placement: 'above' | 'below') {
    return (
      <Tooth
        key={fdi}
        {...common(fdi)}
        state={states.get(fdi)}
        catalogById={catalogById}
        numberPlacement={placement}
        onSelectSurface={(surface) => {
          setActiveTooth(fdi);
          onSelectSurface(fdi, surface);
        }}
      />
    );
  }

  /**
   * Una posición: el permanente en la fila exterior y el temporal en la
   * interior, en una columna del ancho del permanente para que las filas
   * casen. Las ranuras vacías ocupan su sitio sin dibujar nada.
   */
  function renderColumn(column: ChartColumn, arch: Arch, hasPrimaryRow: boolean) {
    const outer = arch === 'upper' ? 'above' : 'below';
    const inner = arch === 'upper' ? 'below' : 'above';
    const permanentSlot = column.permanent ? (
      renderTooth(column.permanent, outer)
    ) : column.unerupted ? (
      <UneruptedTooth key={column.position} {...common(column.position)} numberPlacement={outer} />
    ) : (
      <div aria-hidden className="h-[60px]" />
    );
    const primarySlot = hasPrimaryRow ? (
      column.primary ? (
        renderTooth(column.primary, inner)
      ) : (
        <div aria-hidden className="h-[52px]" />
      )
    ) : null;
    return (
      <div
        key={column.position}
        data-position={column.position}
        className={`flex flex-col items-center gap-1 ${arch === 'upper' ? 'justify-end' : 'justify-start'}`}
        style={{ width: toothWidth(column.position) }}
      >
        {arch === 'upper' ? (
          <>
            {permanentSlot}
            {primarySlot}
          </>
        ) : (
          <>
            {primarySlot}
            {permanentSlot}
          </>
        )}
      </div>
    );
  }

  function renderArch(layout: ArchLayout, arch: Arch) {
    const left = layout.columns.filter((c) => toothChartSide(c.position) === 'left');
    const right = layout.columns.filter((c) => toothChartSide(c.position) === 'right');
    const align = arch === 'upper' ? 'items-end' : 'items-start';
    return (
      // The arches are labelled `group`s, not `role="row"`: a `row` only
      // exists inside a `table`/`grid`, and the nearest ancestor role here is
      // `group` — a nested `group` keeps "Arcada superior/inferior" in the
      // announcement. The arrow keys live on the field's `onKeyDown` plus the
      // teeth's roving tabindex, not on any grid semantics.
      <div role="group" aria-label={arch === 'upper' ? copy.upperRow : copy.lowerRow} className={`flex ${align}`}>
        <div className={`flex ${align} gap-1 pr-3 sm:pr-4`}>
          {left.map((c) => renderColumn(c, arch, layout.hasPrimaryRow))}
        </div>
        {/* Midline. */}
        <div className={`flex ${align} gap-1 border-l border-border pl-3 sm:pl-4`}>
          {right.map((c) => renderColumn(c, arch, layout.hasPrimaryRow))}
        </div>
      </div>
    );
  }

  return (
    <div role="group" aria-label={copy.chartLabel} className="overflow-x-auto">
      <OriginPatterns />
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
        {renderArch(upper, 'upper')}
        {/* Occlusal plane — the horizontal rule the two arches sit against. */}
        <div aria-hidden className="my-2 border-t border-border" />
        {renderArch(lower, 'lower')}
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
