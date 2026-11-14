'use client';
import * as React from 'react';
import { useState, type KeyboardEvent, type RefObject } from 'react';
import { cn } from '@/lib/utils';
import { NativeSelect } from '@/components/ui/native-select';
import type { PerioSite } from '@/lib/perio/perio-api';
import {
  ARCH_TEETH,
  EMPTY_SITE,
  EMPTY_TOOTH,
  applyKey,
  calFor,
  cellsInRow,
  lingualLabel,
  moveFocus,
  probingTone,
  toothOfCell,
  probingTrend,
  siteKey,
  siteShortLabel,
  sitesForRow,
  type CellRef,
  type FocusMove,
  type PendingPrefix,
  type PerioArch,
  type PerioDraft,
  type PerioMeasure,
  type PerioRow,
  type SiteValues,
  type ToothValues,
} from '@/lib/perio/perio-grid';

const copy = {
  upper: 'Arcada superior',
  lower: 'Arcada inferior',
  buccal: 'Vestibular',
  probing: 'Sondaje',
  recession: 'Recesión',
  cal: 'NIC',
  previous: 'Anterior',
  bleeding: 'Sangrado',
  suppuration: 'Supuración',
  plaque: 'Placa',
  calculus: 'Cálculo',
  furcation: 'Furca',
  mobility: 'Movilidad',
  tooth: 'Diente',
  skip: (fdi: number) => `Omitir diente ${fdi}`,
  restore: (fdi: number) => `Incluir diente ${fdi}`,
  absentHint: (fdi: number) => `Incluir diente ${fdi} (ausente en el odontograma)`,
  cell: (measure: string, fdi: number, site: string) => `${measure} ${fdi} ${site}`,
  trend: {
    better: 'mejora',
    worse: 'empeora',
    same: 'sin cambio',
  },
};

/** Filas en el orden en que se pintan: vestibular y luego palatino/lingual. */
const ROWS: readonly PerioRow[] = ['buccal', 'lingual'];

type FlagKey = 'bleeding' | 'suppuration' | 'plaque' | 'calculus';

const FLAG_ROWS: { key: FlagKey; label: string; dot: string }[] = [
  { key: 'bleeding', label: copy.bleeding, dot: 'bg-danger' },
  { key: 'suppuration', label: copy.suppuration, dot: 'bg-warning' },
  { key: 'plaque', label: copy.plaque, dot: 'bg-primary' },
  { key: 'calculus', label: copy.calculus, dot: 'bg-ink' },
];

/**
 * Atajos en una celda de sondaje: marcan (o desmarcan) un sitio sin mover el
 * foco. Justo tras un dígito, el sitio RECIÉN sondeado (el foco ya saltó al
 * siguiente); si no, el de la celda enfocada (DX-403).
 */
const FLAG_SHORTCUTS: Record<string, FlagKey> = {
  b: 'bleeding',
  s: 'suppuration',
  p: 'plaque',
  c: 'calculus',
};

const ARROWS: Record<string, FocusMove> = {
  ArrowRight: 'right',
  ArrowLeft: 'left',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

/**
 * Estado de teclado COMPARTIDO por las dos arcadas (el recorrido en S pasa de
 * una a otra): las celdas por id y el último sondaje hecho con un dígito.
 */
interface LastProbe {
  /** Sitio recién sondeado con un dígito. */
  probed: CellRef;
  /** Celda a la que saltó el foco tras ese dígito. */
  landedId: string;
}

export interface PerioKeyboard {
  inputs: Map<string, HTMLInputElement>;
  lastProbe: () => LastProbe | null;
  setLastProbe: (probe: LastProbe | null) => void;
}

export function createPerioKeyboard(): PerioKeyboard {
  let last: LastProbe | null = null;
  return {
    inputs: new Map(),
    lastProbe: () => last,
    setLastProbe: (probe) => {
      last = probe;
    },
  };
}

interface PerioChartProps {
  arch: PerioArch;
  draft: PerioDraft;
  readOnly: boolean;
  onSiteChange: (toothFdi: number, site: PerioSite, patch: Partial<SiteValues>) => void;
  onToothChange: (toothFdi: number, patch: Partial<ToothValues>) => void;
  /** Sondaje del examen anterior por `siteKey`, o `null` si no se compara. */
  previousProbing: Map<string, number | null> | null;
  /** Compartido con la otra arcada (ver `PerioKeyboard`). */
  keyboard: RefObject<PerioKeyboard>;
  /** Dientes ausentes en el odontograma (solo para explicar por qué están omitidos). */
  absentTeeth: ReadonlySet<number>;
}

function cellId(ref: CellRef): string {
  return `${ref.arch}:${ref.row}:${ref.measure}:${ref.index}`;
}

/**
 * Una arcada del periodontograma: dientes en columnas (18→28 o 48→38), tres
 * sitios por cara, filas de sondaje/recesión editables por teclado, NIC
 * calculado y marcas por sitio. Se desplaza en horizontal DENTRO de su
 * contenedor (la página no crece a lo ancho en 390px).
 */
export function PerioChart({
  arch,
  draft,
  readOnly,
  onSiteChange,
  onToothChange,
  previousProbing,
  keyboard,
  absentTeeth,
}: PerioChartProps) {
  const teeth = ARCH_TEETH[arch];
  const upper = arch === 'upper';
  const [pending, setPending] = useState<{
    id: string;
    prefix: PendingPrefix;
  } | null>(null);

  const site = (fdi: number, s: PerioSite) => draft.sites.get(siteKey(fdi, s)) ?? EMPTY_SITE;
  const tooth = (fdi: number) => draft.teeth.get(fdi) ?? EMPTY_TOOTH;

  function isSkippedCell(ref: CellRef): boolean {
    return tooth(toothOfCell(ref)).skipped;
  }

  /** Destino de `move` saltando los dientes omitidos (no se sondan). */
  function targetOf(from: CellRef, move: FocusMove): CellRef | null {
    return moveFocus(from, move, (fdi) => tooth(fdi).skipped);
  }

  function focusCell(ref: CellRef) {
    const el = keyboard.current.inputs.get(cellId(ref));
    el?.focus();
    el?.select();
  }

  function toggleFlag(ref: CellRef, flag: FlagKey) {
    const cell = cellsInRow(ref.arch, ref.row)[ref.index];
    const values = site(cell.toothFdi, cell.site);
    onSiteChange(cell.toothFdi, cell.site, { [flag]: !values[flag] });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>, ref: CellRef) {
    const kb = keyboard.current;
    const id = cellId(ref);
    const flag = FLAG_SHORTCUTS[event.key.toLowerCase()];
    // Solo B/S/P/C conservan «lo último sondeado»: así «5 b s» marca el mismo sitio.
    const last = kb.lastProbe();
    const probe = last?.landedId === id ? last.probed : null;
    if (!flag) kb.setLastProbe(null);
    const move = ARROWS[event.key];
    if (move) {
      event.preventDefault();
      const next = targetOf(ref, move);
      if (next) focusCell(next);
      return;
    }
    if (readOnly || event.ctrlKey || event.metaKey || event.altKey) return;
    if (flag && ref.measure === 'probing') {
      const target = probe ?? ref;
      if (isSkippedCell(target)) return;
      event.preventDefault();
      toggleFlag(target, flag);
      return;
    }
    if (isSkippedCell(ref)) return;
    const cells = cellsInRow(arch, ref.row);
    const target = cells[ref.index];
    const values = site(target.toothFdi, target.site);
    const field = ref.measure === 'probing' ? 'probingMm' : 'recessionMm';
    const prefix = pending?.id === id ? pending.prefix : '';
    const result = applyKey(event.key, values[field], prefix);
    if (!result) return;
    event.preventDefault();
    // El sondaje no admite negativos: «-» solo tiene sentido en recesión.
    if (result.pending === '-' && ref.measure === 'probing') return;
    setPending(result.pending ? { id, prefix: result.pending } : null);
    if (result.value !== values[field]) {
      onSiteChange(target.toothFdi, target.site, { [field]: result.value });
    }
    if (result.advance) {
      // Al final del recorrido el foco se queda: «b» marca este mismo sitio.
      const landed = targetOf(ref, 'next') ?? ref;
      kb.setLastProbe({ probed: ref, landedId: cellId(landed) });
      if (landed !== ref) focusCell(landed);
    }
  }

  /** Teclados virtuales (móvil) no siempre emiten keydown: se acepta el texto. */
  function handleChange(raw: string, ref: CellRef) {
    if (readOnly || isSkippedCell(ref)) return;
    const cells = cellsInRow(arch, ref.row);
    const target = cells[ref.index];
    const field = ref.measure === 'probing' ? 'probingMm' : 'recessionMm';
    const trimmed = raw.trim();
    if (trimmed === '') {
      onSiteChange(target.toothFdi, target.site, { [field]: null });
      return;
    }
    const parsed = Number(trimmed);
    const min = ref.measure === 'probing' ? 0 : -5;
    if (Number.isInteger(parsed) && parsed >= min && parsed <= 19) {
      onSiteChange(target.toothFdi, target.site, { [field]: parsed });
    }
  }

  function measureRow(row: PerioRow, measure: PerioMeasure, label: string) {
    const cells = cellsInRow(arch, row);
    return (
      <tr>
        <th scope="row" className={labelCell}>
          {label}
        </th>
        {cells.map((cell, index) => {
          const ref: CellRef = { arch, row, measure, index };
          const id = cellId(ref);
          const values = site(cell.toothFdi, cell.site);
          const value = measure === 'probing' ? values.probingMm : values.recessionMm;
          const skipped = tooth(cell.toothFdi).skipped;
          const danger = measure === 'probing' && probingTone(value) === 'danger';
          const prefix = pending?.id === id ? pending.prefix : '';
          return (
            <td key={id} className={cn(siteCell(index), skipped && skippedCell)}>
              <input
                ref={(el) => {
                  if (el) keyboard.current.inputs.set(id, el);
                  else keyboard.current.inputs.delete(id);
                }}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                aria-label={copy.cell(
                  label,
                  cell.toothFdi,
                  siteShortLabel(cell.site, cell.toothFdi),
                )}
                data-danger={danger || undefined}
                // Omitido: sigue enfocable (las flechas lo cruzan) pero no se edita.
                readOnly={readOnly || skipped}
                aria-disabled={skipped || undefined}
                value={prefix && value === null ? prefix : (value ?? '')}
                onKeyDown={(e) => handleKeyDown(e, ref)}
                onChange={(e) => handleChange(e.target.value, ref)}
                onFocus={(e) => e.target.select()}
                onBlur={() => {
                  setPending((p) => (p?.id === id ? null : p));
                  // Al irse de la celda a la que saltó el dígito, «b» ya no apunta atrás.
                  if (keyboard.current.lastProbe()?.landedId === id) {
                    keyboard.current.setLastProbe(null);
                  }
                }}
                className={cn(
                  'h-7 w-6 rounded-sm bg-transparent text-center text-xs tabular-nums text-ink',
                  'focus:bg-primary-subtle focus:outline-none focus:ring-2 focus:ring-primary-text',
                  'aria-disabled:cursor-not-allowed aria-disabled:text-muted',
                  danger && 'font-semibold text-danger-text',
                )}
              />
            </td>
          );
        })}
      </tr>
    );
  }

  function calRow(row: PerioRow) {
    const cells = cellsInRow(arch, row);
    return (
      <tr>
        <th scope="row" className={labelCell}>
          {copy.cal}
        </th>
        {cells.map((cell, index) => {
          const cal = calFor(site(cell.toothFdi, cell.site));
          return (
            <td
              key={`cal-${cell.toothFdi}-${cell.site}`}
              className={cn(siteCell(index), 'h-6 text-center text-xs tabular-nums text-muted')}
            >
              {cal ?? ''}
            </td>
          );
        })}
      </tr>
    );
  }

  function previousRow(row: PerioRow) {
    if (!previousProbing) return null;
    const cells = cellsInRow(arch, row);
    return (
      <tr>
        <th scope="row" className={labelCell}>
          {copy.previous}
        </th>
        {cells.map((cell, index) => {
          const key = siteKey(cell.toothFdi, cell.site);
          const before = previousProbing.get(key) ?? null;
          const trend = probingTrend(site(cell.toothFdi, cell.site).probingMm, before);
          const label =
            before === null
              ? undefined
              : `${copy.previous} ${cell.toothFdi} ${siteShortLabel(cell.site, cell.toothFdi)}: ${before} mm${
                  trend ? `, ${copy.trend[trend]}` : ''
                }`;
          return (
            <td
              key={`prev-${key}`}
              aria-label={label}
              data-trend={trend ?? undefined}
              className={cn(
                siteCell(index),
                'h-6 text-center text-[11px] tabular-nums text-muted',
                trend === 'better' && 'font-semibold text-success-text',
                trend === 'worse' && 'font-semibold text-danger-text',
              )}
            >
              {before ?? ''}
              {trend === 'better' ? '↓' : trend === 'worse' ? '↑' : ''}
            </td>
          );
        })}
      </tr>
    );
  }

  function flagRow(row: PerioRow, flag: (typeof FLAG_ROWS)[number]) {
    const cells = cellsInRow(arch, row);
    return (
      <tr key={`${row}-${flag.key}`}>
        <th scope="row" className={labelCell}>
          {flag.label}
        </th>
        {cells.map((cell, index) => {
          const active = site(cell.toothFdi, cell.site)[flag.key];
          const skipped = tooth(cell.toothFdi).skipped;
          return (
            <td
              key={`${flag.key}-${cell.toothFdi}-${cell.site}`}
              className={cn(siteCell(index), skipped && skippedCell)}
            >
              <button
                type="button"
                tabIndex={-1}
                aria-pressed={active}
                aria-label={`${flag.label} ${cell.toothFdi} ${siteShortLabel(cell.site, cell.toothFdi)}`}
                disabled={readOnly || skipped}
                onClick={() =>
                  onSiteChange(cell.toothFdi, cell.site, {
                    [flag.key]: !active,
                  })
                }
                className="flex h-5 w-6 items-center justify-center rounded-sm hover:bg-canvas disabled:cursor-default disabled:hover:bg-transparent"
              >
                <span
                  aria-hidden
                  className={cn(
                    'size-2.5 rounded-full border',
                    active ? cn(flag.dot, 'border-transparent') : 'border-border',
                  )}
                />
              </button>
            </td>
          );
        })}
      </tr>
    );
  }

  function furcationRow(row: PerioRow) {
    // La furca se guarda en el sitio central de la cara (B o L).
    const centre: PerioSite = row === 'buccal' ? 'B' : 'L';
    return (
      <tr>
        <th scope="row" className={labelCell}>
          {copy.furcation}
        </th>
        {teeth.map((fdi) => {
          const value = site(fdi, centre).furcation;
          return (
            <td
              key={`furc-${row}-${fdi}`}
              colSpan={3}
              className={cn(toothCell, tooth(fdi).skipped && skippedCell)}
            >
              <NativeSelect
                aria-label={`${copy.furcation} ${fdi} ${row === 'buccal' ? copy.buccal : lingualLabel(upper)}`}
                value={value ?? ''}
                disabled={readOnly || tooth(fdi).skipped}
                onChange={(e) =>
                  onSiteChange(fdi, centre, {
                    furcation: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
                className="[&>svg]:hidden"
                  selectClassName={cellSelectClass}
              >
                <option value="">–</option>
                {[0, 1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </NativeSelect>
            </td>
          );
        })}
      </tr>
    );
  }

  function sideHeader(row: PerioRow) {
    const label = row === 'buccal' ? copy.buccal : lingualLabel(upper);
    return (
      <tr>
        <th
          scope="rowgroup"
          colSpan={1 + teeth.length * 3}
          className="sticky left-0 bg-surface-sunken px-2 py-1 text-left text-xs font-semibold uppercase tracking-wide text-muted"
        >
          {label}
        </th>
      </tr>
    );
  }

  function side(row: PerioRow) {
    return (
      <tbody>
        {sideHeader(row)}
        <tr>
          <th scope="row" className={labelCell}>
            <span className="sr-only">{copy.tooth}</span>
          </th>
          {teeth.map((fdi) =>
            sitesForRow(fdi, row).map((s, i) => (
              <td
                key={`lbl-${row}-${fdi}-${s}`}
                className={cn(siteCell(i === 0 ? 0 : 1), 'text-center text-[10px] text-muted')}
              >
                {siteShortLabel(s, fdi)}
              </td>
            )),
          )}
        </tr>
        {measureRow(row, 'probing', copy.probing)}
        {measureRow(row, 'recession', copy.recession)}
        {calRow(row)}
        {previousRow(row)}
        {FLAG_ROWS.map((flag) => flagRow(row, flag))}
        {furcationRow(row)}
      </tbody>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table aria-label={upper ? copy.upper : copy.lower} className="border-collapse text-ink">
        <caption className="sr-only">{upper ? copy.upper : copy.lower}</caption>
        <thead>
          <tr className="border-b border-border bg-surface-sunken">
            <th scope="col" className={cn(labelCell, 'bg-surface-sunken')}>
              {copy.tooth}
            </th>
            {teeth.map((fdi) => {
              const t = tooth(fdi);
              const absentSkipped = t.skipped && absentTeeth.has(fdi);
              return (
                <th key={`h-${fdi}`} scope="col" colSpan={3} className={cn(toothCell, 'py-1')}>
                  <button
                    type="button"
                    aria-pressed={t.skipped}
                    aria-label={t.skipped ? copy.restore(fdi) : copy.skip(fdi)}
                    title={
                      absentSkipped
                        ? copy.absentHint(fdi)
                        : t.skipped
                          ? copy.restore(fdi)
                          : copy.skip(fdi)
                    }
                    disabled={readOnly}
                    onClick={() => onToothChange(fdi, { skipped: !t.skipped })}
                    className={cn(
                      'w-full rounded-sm px-1 text-sm font-semibold tabular-nums hover:bg-canvas disabled:hover:bg-transparent',
                      t.skipped && 'text-muted line-through',
                    )}
                  >
                    {fdi}
                  </button>
                </th>
              );
            })}
          </tr>
          <tr>
            <th scope="row" className={labelCell}>
              {copy.mobility}
            </th>
            {teeth.map((fdi) => (
              <td
                key={`mob-${fdi}`}
                colSpan={3}
                className={cn(toothCell, tooth(fdi).skipped && skippedCell)}
              >
                <NativeSelect
                  aria-label={`${copy.mobility} ${fdi}`}
                  value={tooth(fdi).mobility ?? ''}
                  disabled={readOnly || tooth(fdi).skipped}
                  onChange={(e) =>
                    onToothChange(fdi, {
                      mobility: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  className="[&>svg]:hidden"
                  selectClassName={cellSelectClass}
                >
                  <option value="">–</option>
                  {[0, 1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </NativeSelect>
              </td>
            ))}
          </tr>
        </thead>
        {ROWS.map((row) => (
          <React.Fragment key={row}>{side(row)}</React.Fragment>
        ))}
      </table>
    </div>
  );
}

const labelCell =
  'sticky left-0 z-10 whitespace-nowrap bg-surface px-2 text-left text-xs font-medium text-muted';
/** Selector de celda (furca, movilidad): NativeSelect sin chevron, al alto de la fila. */
const cellSelectClass =
  'h-6 rounded-sm px-0 pr-0 text-center text-xs pointer-coarse:h-8 pointer-coarse:text-xs disabled:border-transparent disabled:bg-transparent disabled:text-ink';

const toothCell = 'border-l border-border-subtle px-0.5 text-center';
const skippedCell = 'bg-canvas';

/** El primer sitio de cada diente lleva el separador vertical. */
function siteCell(index: number): string {
  return cn('p-0', index % 3 === 0 && 'border-l border-border-subtle');
}
