"use client";
import * as React from "react";
import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

export type ExpensesTabKey = "gastos" | "resumen";

const TABS: { key: ExpensesTabKey; label: string }[] = [
  { key: "gastos", label: "Gastos" },
  { key: "resumen", label: "Resumen" },
];

const copy = {
  tablist: "Vistas de los gastos",
};

/** `?tab=` de la URL → pestaña (cualquier otro valor cae en «Gastos»). */
export function resolveExpensesTab(
  value: string | null | undefined,
): ExpensesTabKey {
  return value === "resumen" ? "resumen" : "gastos";
}

export const expensesTabId = (key: ExpensesTabKey) => `expenses-tab-${key}`;
export const expensesPanelId = (key: ExpensesTabKey) => `expenses-panel-${key}`;

/** Las pestañas, bajo la cabecera, y el panel que rotulan. */
export interface ExpensesViewTabs {
  nav: React.ReactNode;
  panelId: string;
  tabId: string;
}

/** Atributos ARIA del panel de una vista que vive bajo pestañas. */
export function expensesPanelProps(tabs: ExpensesViewTabs | undefined) {
  return tabs
    ? ({
        role: "tabpanel",
        id: tabs.panelId,
        "aria-labelledby": tabs.tabId,
      } as const)
    : {};
}

interface ExpensesTabsProps {
  active: ExpensesTabKey;
  onChange: (tab: ExpensesTabKey) => void;
}

/**
 * Pestañas de los gastos (DX-274): «Gastos» (la lista) y «Resumen» (ingresos
 * contra gastos por mes). Mismo patrón ARIA que las de la Caja: activación
 * manual, las flechas mueven el foco y Enter/Espacio (o el clic) eligen.
 */
export function ExpensesTabs({ active, onChange }: ExpensesTabsProps) {
  const refs = useRef<Record<ExpensesTabKey, HTMLButtonElement | null>>({
    gastos: null,
    resumen: null,
  });

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = TABS.length - 1;
    const next =
      event.key === "ArrowRight"
        ? index === last
          ? 0
          : index + 1
        : event.key === "ArrowLeft"
          ? index === 0
            ? last
            : index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
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
            id={expensesTabId(tab.key)}
            aria-selected={selected}
            aria-controls={expensesPanelId(tab.key)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.key)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={cn(
              "-mb-px min-h-11 whitespace-nowrap border-b-2 px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              selected
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-ink",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
