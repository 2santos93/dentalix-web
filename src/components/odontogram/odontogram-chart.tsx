'use client';

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { ToothSurface } from '@/lib/odontogram/odontogram-api';
import type { ToothState } from '@/lib/odontogram/projection';
import {
  chartLayoutForArch,
  type ArchLayout,
  type ChartColumn,
  type DentitionType,
} from '@/lib/odontogram/dentition';
import { toothChartSide, toothWidth, type Arch, type ChartSide } from '@/lib/odontogram/tooth-anatomy';
import { OriginPatterns } from './origin-patterns';
import { Tooth, UneruptedTooth } from './tooth';
import { cn } from '@/lib/utils';

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
  // Carta partida en el móvil: cada lado de la boca en su propio campo.
  sideRight: 'lado derecho',
  sideLeft: 'lado izquierdo',
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

/** Medidas del dibujo (px), las mismas que ponen las clases de abajo en el móvil. */
const COLUMN_GAP = 4; // gap-1
const MIDLINE_PAD = 12; // pr-3 / pl-3 a cada lado de la línea media
const FIELD_PAD_X = 16; // px-4 del campo
const FIELD_BORDER = 1;
/** Holgura: rótulos y redondeos de subpíxel. */
const FIT_SLACK = 8;

function halfWidth(layout: ArchLayout, side: ChartSide): number {
  const columns = layout.columns.filter((c) => toothChartSide(c.position) === side);
  if (columns.length === 0) return 0;
  return columns.reduce((sum, c) => sum + toothWidth(c.position), 0) + COLUMN_GAP * (columns.length - 1);
}

/**
 * Ancho natural de la carta entera y de un lado suelto, calculado de la
 * anatomía (no medido): así se decide la disposición antes de pintarla.
 */
export function chartWidths(upper: ArchLayout, lower: ArchLayout): { full: number; side: number } {
  const frame = 2 * (FIELD_PAD_X + FIELD_BORDER) + FIT_SLACK;
  const side = (s: ChartSide) => Math.max(halfWidth(upper, s), halfWidth(lower, s));
  return {
    full: side('left') + side('right') + 2 * MIDLINE_PAD + 1 + frame,
    side: Math.max(side('left'), side('right')) + frame,
  };
}

/**
 * Disposición según el ancho disponible (DESIGN.md → Odontogram, móvil):
 * `full` es la carta de siempre; `split` parte la boca por la línea media en
 * dos campos apilados (lado derecho del paciente: cuadrantes 1 y 4; lado
 * izquierdo: 2 y 3), cada uno con sus dos arcadas frente al plano oclusal, y
 * solo si ni así cabe se escala. Antes, a 390px, los cuadrantes 2 y 3 quedaban
 * fuera de la pantalla sin aviso; escalar la carta entera los dejaba con
 * números de 7px.
 */
export function chartFit(
  available: number | null,
  widths: { full: number; side: number },
): { mode: 'full' | 'split'; scale: number } {
  if (!available || available >= widths.full) return { mode: 'full', scale: 1 };
  return { mode: 'split', scale: Math.min(1, available / widths.side) };
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
 * Narrow (mobile) viewports split the mouth at the midline into two stacked
 * fields (see `chartFit`), so every quadrant is on screen without scrolling;
 * `overflow-x-auto` stays as the last resort.
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

  // Ancho disponible para la carta (null hasta medirlo: en el servidor y en
  // jsdom se pinta la carta entera, como siempre).
  const frameRef = useRef<HTMLDivElement>(null);
  const splitRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState<number | null>(null);
  const [splitHeight, setSplitHeight] = useState<number | null>(null);
  const fit = chartFit(available, chartWidths(upper, lower));
  const scaled = fit.mode === 'split' && fit.scale < 0.999;
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      setAvailable(frame.clientWidth || null);
      // Alto sin escalar de la carta partida (el `transform` no lo cambia).
      setSplitHeight(splitRef.current?.offsetHeight || null);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    if (splitRef.current) observer.observe(splitRef.current);
    return () => observer.disconnect();
  }, [fit.mode]);

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

  function renderHalf(layout: ArchLayout, arch: Arch, side: ChartSide, midline: boolean) {
    const align = arch === 'upper' ? 'items-end' : 'items-start';
    const columns = layout.columns.filter((c) => toothChartSide(c.position) === side);
    return (
      <div
        className={cn(
          `flex ${align} gap-1`,
          midline && (side === 'left' ? 'pr-3 sm:pr-4' : 'border-l border-border pl-3 sm:pl-4'),
        )}
      >
        {columns.map((c) => renderColumn(c, arch, layout.hasPrimaryRow))}
      </div>
    );
  }

  function archLabel(arch: Arch, side?: ChartSide) {
    const base = arch === 'upper' ? copy.upperRow : copy.lowerRow;
    if (!side) return base;
    return `${base}, ${side === 'left' ? copy.sideRight : copy.sideLeft}`;
  }

  function renderArch(layout: ArchLayout, arch: Arch) {
    const align = arch === 'upper' ? 'items-end' : 'items-start';
    return (
      // The arches are labelled `group`s, not `role="row"`: a `row` only
      // exists inside a `table`/`grid`, and the nearest ancestor role here is
      // `group` — a nested `group` keeps "Arcada superior/inferior" in the
      // announcement. The arrow keys live on the field's `onKeyDown` plus the
      // teeth's roving tabindex, not on any grid semantics.
      <div role="group" aria-label={archLabel(arch)} className={`flex ${align}`}>
        {renderHalf(layout, arch, 'left', true)}
        {/* Midline. */}
        {renderHalf(layout, arch, 'right', true)}
      </div>
    );
  }

  /** Un lado de la boca en su propio campo (disposición `split`). */
  function renderSideField(side: ChartSide) {
    const [top, bottom] =
      side === 'left' ? [copy.quadrant1, copy.quadrant4] : [copy.quadrant2, copy.quadrant3];
    return (
      <div className="w-fit min-w-max rounded-xl border border-border bg-canvas px-4 py-3">
        <QuadrantCaptions left={side === 'left' ? top : ''} right={side === 'right' ? top : ''} />
        <div role="group" aria-label={archLabel('upper', side)} className="flex items-end">
          {renderHalf(upper, 'upper', side, false)}
        </div>
        <div aria-hidden className="my-2 border-t border-border" />
        <div role="group" aria-label={archLabel('lower', side)} className="flex items-start">
          {renderHalf(lower, 'lower', side, false)}
        </div>
        <QuadrantCaptions left={side === 'left' ? bottom : ''} right={side === 'right' ? bottom : ''} />
      </div>
    );
  }

  return (
    <div ref={frameRef} role="group" aria-label={copy.chartLabel} className={scaled ? 'overflow-hidden' : 'overflow-x-auto'}>
      <OriginPatterns />
      <p className="sr-only">{copy.keyboardHint}</p>
      {fit.mode === 'full' ? (
        /* The paper field: the chart is drawn on the app's paper tone, inset in
           a surface-level page, the way a form sits on a clinical record. */
        <div
          onKeyDown={handleKeyDown}
          // `w-fit` para que el campo mida lo que miden las arcadas: así la línea
          // media, el plano oclusal y los rótulos de cuadrante enmarcan el dibujo
          // en vez de estirarse a todo el ancho de la página.
          className="w-fit min-w-max rounded-xl border border-border bg-canvas px-4 py-3 sm:px-6 sm:py-4"
        >
          <QuadrantCaptions left={copy.quadrant1} right={copy.quadrant2} />
          {renderArch(upper, 'upper')}
          {/* Occlusal plane — the horizontal rule the two arches sit against. */}
          <div aria-hidden className="my-2 border-t border-border" />
          {renderArch(lower, 'lower')}
          <QuadrantCaptions left={copy.quadrant4} right={copy.quadrant3} />
        </div>
      ) : (
        // Móvil: los dos lados apilados, en el orden de lectura de la carta
        // (el lado derecho del paciente es la mitad izquierda del dibujo). Las
        // flechas siguen el mismo modelo de filas: → desde el 11 va al 21.
        <div style={scaled ? { height: splitHeight ? splitHeight * fit.scale : undefined } : undefined}>
          <div
            ref={splitRef}
            onKeyDown={handleKeyDown}
            className="flex w-fit flex-col gap-3"
            style={scaled ? { transform: `scale(${fit.scale})`, transformOrigin: 'top left' } : undefined}
          >
            {renderSideField('left')}
            {renderSideField('right')}
          </div>
        </div>
      )}
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
