'use client';
import * as React from 'react';
import { TabBar } from '@/components/ui/tabs';

export type ExpensesTabKey = 'gastos' | 'resumen';

const TABS: { key: ExpensesTabKey; label: string }[] = [
  { key: 'gastos', label: 'Gastos' },
  { key: 'resumen', label: 'Resumen' },
];

const copy = {
  tablist: 'Vistas de los gastos',
};

/** `?tab=` de la URL → pestaña (cualquier otro valor cae en «Gastos»). */
export function resolveExpensesTab(value: string | null | undefined): ExpensesTabKey {
  return value === 'resumen' ? 'resumen' : 'gastos';
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
        role: 'tabpanel',
        id: tabs.panelId,
        'aria-labelledby': tabs.tabId,
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
  return (
    <TabBar
      aria-label={copy.tablist}
      value={active}
      onValueChange={onChange}
      className="mb-6"
      items={TABS.map((tab) => ({
        value: tab.key,
        label: tab.label,
        id: expensesTabId(tab.key),
        controls: expensesPanelId(tab.key),
      }))}
    />
  );
}
