'use client';
import * as React from 'react';
import { useState } from 'react';
import { ChevronDown, Copy, Plus, Trash2 } from 'lucide-react';
import { WEEKDAY_LABELS } from '@/lib/locations/schedule-api';
import {
  MAX_RANGES_PER_DAY,
  copyDay,
  type DraftRange,
  type ScheduleDraft,
} from '@/lib/locations/provider-schedule';
import type { RosterLocation } from '@/lib/locations/provider-schedule-api';
import { Button } from '@/components/ui/button';
import { TimeField } from '@/components/ui/date-field';
import { Checkbox } from '@/components/ui/checkbox';
import { useDateLocale } from '@/components/ui/date-locale';
import { weekOrder } from './week-order';
import { FormModal } from '@/components/shared/form-modal';
import { cn } from '@/lib/utils';

const copy = {
  day: 'Día',
  addRange: (location: string) => `Agregar tramo en ${location}`,
  addRangeShort: 'Tramo',
  removeRange: (where: string) => `Quitar tramo, ${where}`,
  from: (where: string) => `Desde, ${where}`,
  to: (where: string) => `Hasta, ${where}`,
  rangeWhere: (day: string, location: string, n: number) => `${day}, ${location}, tramo ${n}`,
  noRanges: 'No trabaja',
  copyDay: (day: string) => `Copiar el ${day.toLowerCase()} a otros días`,
  copyDayShort: 'Copiar a…',
  copyTitle: (day: string) => `Copiar el ${day.toLowerCase()}`,
  copyDescription:
    'Los días elegidos quedan con los mismos tramos que este, en todas las sedes. Lo que tuvieran se sustituye.',
  copySubmit: 'Copiar',
  copyTargets: 'Días de destino',
  dayFree: 'Libre',
};

const DEFAULT_RANGE: DraftRange = { start: '08:00', end: '13:00' };

interface ProviderWeekEditorProps {
  draft: ScheduleDraft;
  locations: RosterLocation[];
  /** ADMIN: campos editables; si no, solo texto. */
  canEdit: boolean;
  onChange: (draft: ScheduleDraft) => void;
}

/** Resumen de un día para la cabecera del acordeón (móvil). */
function daySummary(draft: ScheduleDraft, locations: RosterLocation[], weekday: number): string {
  const parts = locations
    .filter((l) => (draft[l.id]?.[weekday] ?? []).length > 0)
    .map((l) => `${l.name} ${draft[l.id][weekday].map((r) => `${r.start}–${r.end}`).join(', ')}`);
  return parts.length > 0 ? parts.join(' · ') : copy.dayFree;
}

/**
 * Editor semanal de un profesional (DX-233): filas = días (lunes a domingo),
 * una columna por sede. A 390 px cada día es un acordeón con sus sedes
 * apiladas; desde `md`, una rejilla sin scroll horizontal de página.
 */
export function ProviderWeekEditor({ draft, locations, canEdit, onChange }: ProviderWeekEditorProps) {
  const [expanded, setExpanded] = useState<number | null>(1);
  const [copyFrom, setCopyFrom] = useState<number | null>(null);
  const [copyTargets, setCopyTargets] = useState<number[]>([]);

  const cols = { '--locs': locations.length } as React.CSSProperties;
  // B6: la semana empieza donde la empieza el formato de la sede (como Horarios → Sede).
  const order = weekOrder(useDateLocale().locale);

  function setDay(locationId: string, weekday: number, ranges: DraftRange[]) {
    const week = draft[locationId].map((d, i) => (i === weekday ? ranges : d));
    onChange({ ...draft, [locationId]: week });
  }

  function openCopy(weekday: number) {
    setCopyFrom(weekday);
    setCopyTargets([]);
  }

  function submitCopy(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // El modal vive en un portal, pero el evento de React sube por el árbol de
    // componentes: sin esto, «Copiar» también enviaría el formulario del horario.
    e.stopPropagation();
    if (copyFrom === null) return;
    onChange(copyDay(draft, copyFrom, copyTargets));
    setCopyFrom(null);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      {/* Cabecera de columnas: solo desde md (en móvil cada sede se nombra dentro del día). */}
      <div
        aria-hidden
        className="hidden border-b border-border bg-surface-sunken md:grid md:[grid-template-columns:9rem_repeat(var(--locs),minmax(0,1fr))]"
        style={cols}
      >
        <span className="px-4 py-2.5 t-label text-muted">{copy.day}</span>
        {locations.map((l) => (
          <span key={l.id} className="truncate border-l border-border px-4 py-2.5 t-label text-muted">
            {l.name}
          </span>
        ))}
      </div>

      <div className="divide-y divide-border-subtle">
        {order.map((weekday) => {
          const label = WEEKDAY_LABELS[weekday];
          const open = expanded === weekday;
          const panelId = `provider-day-${weekday}`;
          return (
            <div
              key={weekday}
              role="group"
              aria-label={label}
              className="md:grid md:[grid-template-columns:9rem_repeat(var(--locs),minmax(0,1fr))]"
              style={cols}
            >
              {/* Móvil: acordeón. */}
              <button
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setExpanded(open ? null : weekday)}
                className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-text md:hidden"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium text-ink">{label}</span>
                  <span className="truncate text-xs tabular-nums text-muted">
                    {daySummary(draft, locations, weekday)}
                  </span>
                </span>
                <ChevronDown
                  aria-hidden
                  className={cn('size-4 shrink-0 text-muted transition-transform', open && 'rotate-180')}
                />
              </button>
              {/* Escritorio: nombre del día (su «Copiar a…» se coloca debajo, en la misma celda). */}
              <span
                className={cn(
                  'hidden px-4 pt-3 text-sm font-medium text-ink md:row-start-1 md:col-start-1 md:block',
                  canEdit && 'md:pb-12',
                )}
              >
                {label}
              </span>
              <div
                id={panelId}
                className={cn(
                  'flex-col gap-3 px-4 pb-4 md:contents',
                  open ? 'flex' : 'hidden',
                )}
              >
                {locations.map((l) => {
                  const ranges = draft[l.id]?.[weekday] ?? [];
                  return (
                    <div
                      key={l.id}
                      className="flex min-w-0 flex-col gap-2 md:border-l md:border-border md:px-4 md:py-3"
                    >
                      <span className="text-xs font-medium text-muted md:hidden">{l.name}</span>
                      {!canEdit ? (
                        <span className="text-sm tabular-nums text-ink">
                          {ranges.length > 0
                            ? ranges.map((r) => `${r.start}–${r.end}`).join(', ')
                            : <span className="text-muted">{copy.noRanges}</span>}
                        </span>
                      ) : (
                        <>
                          {ranges.map((range, index) => {
                            const where = copy.rangeWhere(label, l.name, index + 1);
                            return (
                              <div key={index} className="flex min-w-0 flex-wrap items-center gap-1.5">
                                <TimeField
                                  required
                                  aria-label={copy.from(where)}
                                  value={range.start || null}
                                  onChange={(v) =>
                                    setDay(
                                      l.id,
                                      weekday,
                                      ranges.map((r, i) => (i === index ? { ...r, start: v ?? '' } : r)),
                                    )
                                  }
                                  className="w-32"
                                />
                                <span aria-hidden className="text-muted">–</span>
                                <TimeField
                                  required
                                  aria-label={copy.to(where)}
                                  value={range.end || null}
                                  onChange={(v) =>
                                    setDay(
                                      l.id,
                                      weekday,
                                      ranges.map((r, i) => (i === index ? { ...r, end: v ?? '' } : r)),
                                    )
                                  }
                                  className="w-32"
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  className="text-muted hover:bg-danger-subtle hover:text-danger-text"
                                  aria-label={copy.removeRange(where)}
                                  onClick={() => setDay(l.id, weekday, ranges.filter((_, i) => i !== index))}
                                >
                                  <Trash2 aria-hidden />
                                </Button>
                              </div>
                            );
                          })}
                          {ranges.length < MAX_RANGES_PER_DAY ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="self-start"
                              aria-label={copy.addRange(l.name)}
                              onClick={() => setDay(l.id, weekday, [...ranges, { ...DEFAULT_RANGE }])}
                            >
                              <Plus className="size-3.5" aria-hidden /> {copy.addRangeShort}
                            </Button>
                          ) : null}
                        </>
                      )}
                    </div>
                  );
                })}
                {canEdit ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    // Un solo botón: en móvil cierra el día; desde md se coloca
                    // en la celda del nombre del día, debajo de él.
                    className="self-start text-muted md:col-start-1 md:row-start-1 md:mb-2 md:ml-2 md:self-end md:justify-self-start"
                    aria-label={copy.copyDay(label)}
                    onClick={() => openCopy(weekday)}
                  >
                    <Copy className="size-3.5" aria-hidden /> {copy.copyDayShort}
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <FormModal
        open={copyFrom !== null}
        onOpenChange={(o) => {
          if (!o) setCopyFrom(null);
        }}
        title={copyFrom !== null ? copy.copyTitle(WEEKDAY_LABELS[copyFrom]) : ''}
        description={copy.copyDescription}
        onSubmit={submitCopy}
        submitLabel={copy.copySubmit}
        submitDisabled={copyTargets.length === 0}
      >
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-xs font-medium text-muted">{copy.copyTargets}</legend>
          {order.filter((w) => w !== copyFrom).map((w) => (
            <Checkbox
              key={w}
              label={WEEKDAY_LABELS[w]}
              checked={copyTargets.includes(w)}
              onChange={(e) =>
                setCopyTargets((prev) => (e.target.checked ? [...prev, w] : prev.filter((x) => x !== w)))
              }
            />
          ))}
        </fieldset>
      </FormModal>
    </div>
  );
}
