'use client';
import * as React from 'react';
import { useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

export type ScheduleTabKey = 'sede' | 'profesionales' | 'cuadrante';

const TABS: { key: ScheduleTabKey; label: string }[] = [
  { key: 'sede', label: 'Sede' },
  { key: 'profesionales', label: 'Profesionales' },
  { key: 'cuadrante', label: 'Cuadrante' },
];

const copy = { tablist: 'Horarios' };

/** `?tab=` de la URL → pestaña (cualquier otro valor cae en «Sede»). */
export function resolveScheduleTab(value: string | null | undefined): ScheduleTabKey {
  return value === 'profesionales' || value === 'cuadrante' ? value : 'sede';
}

export const scheduleTabId = (key: ScheduleTabKey) => `schedule-tab-${key}`;
export const schedulePanelId = (key: ScheduleTabKey) => `schedule-panel-${key}`;

/**
 * Pestañas de `/settings/horarios` (DX-233): el horario de la sede activa, el
 * de cada profesional por sede y el cuadrante semanal. Mismo patrón ARIA que
 * las de la Caja: activación manual, flechas mueven el foco.
 */
export function ScheduleTabs({
  active,
  onChange,
}: {
  active: ScheduleTabKey;
  onChange: (tab: ScheduleTabKey) => void;
}) {
  const refs = useRef<Partial<Record<ScheduleTabKey, HTMLButtonElement | null>>>({});

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = TABS.length - 1;
    const keys: Record<string, number> = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    };
    const next = keys[event.key];
    if (next === undefined) return;
    event.preventDefault();
    refs.current[TABS[next].key]?.focus();
  }

  return (
    <div role="tablist" aria-label={copy.tablist} className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
      {TABS.map((tab, index) => {
        const selected = tab.key === active;
        return (
          <button
            key={tab.key}
            ref={(el) => {
              refs.current[tab.key] = el;
            }}
            type="button"
            role="tab"
            id={scheduleTabId(tab.key)}
            aria-selected={selected}
            aria-controls={schedulePanelId(tab.key)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.key)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={cn(
              '-mb-px min-h-11 whitespace-nowrap border-b-2 px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              selected ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
