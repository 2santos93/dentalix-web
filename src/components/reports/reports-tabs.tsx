'use client';
import * as React from 'react';
import { useRef, type KeyboardEvent } from 'react';
import type { ClinicRole } from '@/lib/me/me-api';
import { cn } from '@/lib/utils';

/**
 * Pestañas de «Reportes» (DX-014): «Comparar sedes» (solo ADMIN) y
 * «Producción por procedimiento» (DX-423: ADMIN y DENTIST, que ve solo la
 * suya). Las siguientes son una línea más en `REPORT_TABS` y su vista en la
 * página. Patrón ARIA de pestañas con activación manual, como la Caja: las
 * flechas mueven el foco y Enter/Espacio (o el clic) eligen.
 */
export const REPORT_TABS = [
  { key: 'comparar-sedes', label: 'Comparar sedes', roles: ['ADMIN'] },
  { key: 'produccion', label: 'Producción por procedimiento', roles: ['ADMIN', 'DENTIST'] },
] as const satisfies readonly { key: string; label: string; roles: readonly ClinicRole[] }[];

export type ReportTabKey = (typeof REPORT_TABS)[number]['key'];
export type ReportTab = (typeof REPORT_TABS)[number];

/**
 * Las pestañas que el rol puede abrir (copian los `@Roles` de la API). Un rol
 * sin ninguna ve la primera, cuyo 403 enseña el aviso de la propia vista.
 */
export function reportTabsFor(role: ClinicRole | null): readonly ReportTab[] {
  const tabs = REPORT_TABS.filter((tab) => role !== null && (tab.roles as readonly ClinicRole[]).includes(role));
  return tabs.length > 0 ? tabs : [REPORT_TABS[0]];
}

const copy = {
  tablist: 'Reportes disponibles',
};

/** `?tab=` de la URL → pestaña de las de `tabs` (si no, la primera). */
export function resolveReportTab(
  value: string | null | undefined,
  tabs: readonly ReportTab[] = REPORT_TABS,
): ReportTabKey {
  return tabs.find((tab) => tab.key === value)?.key ?? tabs[0].key;
}

export const reportTabId = (key: ReportTabKey) => `report-tab-${key}`;
export const reportPanelId = (key: ReportTabKey) => `report-panel-${key}`;

export function ReportsTabs({
  active,
  onChange,
  tabs = REPORT_TABS,
}: {
  active: ReportTabKey;
  onChange: (tab: ReportTabKey) => void;
  tabs?: readonly ReportTab[];
}) {
  const refs = useRef<Partial<Record<ReportTabKey, HTMLButtonElement | null>>>({});

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = tabs.length - 1;
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
    refs.current[tabs[next].key]?.focus();
  }

  return (
    <div role="tablist" aria-label={copy.tablist} className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((tab, index) => {
        const selected = tab.key === active;
        return (
          <button
            key={tab.key}
            ref={(el) => {
              refs.current[tab.key] = el;
            }}
            type="button"
            role="tab"
            id={reportTabId(tab.key)}
            aria-selected={selected}
            aria-controls={reportPanelId(tab.key)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.key)}
            onKeyDown={(event) => onKeyDown(event, index)}
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
