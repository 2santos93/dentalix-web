'use client';
import * as React from 'react';
import { useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

export type CashTabKey = 'abonos' | 'turnos';

const TABS: { key: CashTabKey; label: string }[] = [
  { key: 'abonos', label: 'Abonos' },
  { key: 'turnos', label: 'Turnos' },
];

const copy = {
  tablist: 'Vistas de la caja',
};

/** `?tab=` de la URL → pestaña (cualquier otro valor cae en «Abonos»). */
export function resolveCashTab(value: string | null | undefined): CashTabKey {
  return value === 'turnos' ? 'turnos' : 'abonos';
}

export const cashTabId = (key: CashTabKey) => `cash-tab-${key}`;
export const cashPanelId = (key: CashTabKey) => `cash-panel-${key}`;

interface CashTabsProps {
  active: CashTabKey;
  onChange: (tab: CashTabKey) => void;
}

/**
 * Pestañas de la Caja (DX-027): «Abonos» (la caja del período, DX-002) y
 * «Turnos» (apertura y cierre por usuario y sede). Patrón ARIA de pestañas con
 * activación manual, como la ficha del paciente: las flechas mueven el foco y
 * Enter/Espacio (o el clic) eligen; cada panel carga datos al montarse.
 */
export function CashTabs({ active, onChange }: CashTabsProps) {
  const refs = useRef<Record<CashTabKey, HTMLButtonElement | null>>({ abonos: null, turnos: null });

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = TABS.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : event.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    refs.current[TABS[next].key]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={copy.tablist}
      className="mb-6 flex gap-1 overflow-x-auto border-b border-border"
    >
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
            id={cashTabId(tab.key)}
            aria-selected={selected}
            aria-controls={cashPanelId(tab.key)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.key)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={cn(
              '-mb-px min-h-11 whitespace-nowrap border-b-2 px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              selected
                ? 'border-primary text-primary'
                : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
