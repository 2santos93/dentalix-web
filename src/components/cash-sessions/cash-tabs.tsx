'use client';
import { TabBar } from '@/components/ui/tabs';

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
  return (
    <TabBar
      aria-label={copy.tablist}
      value={active}
      onValueChange={onChange}
      className="mb-6"
      items={TABS.map((tab) => ({
        value: tab.key,
        label: tab.label,
        id: cashTabId(tab.key),
        controls: cashPanelId(tab.key),
      }))}
    />
  );
}
