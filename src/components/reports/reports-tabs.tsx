'use client';
import { TabBar } from '@/components/ui/tabs';

/**
 * Pestañas de «Reportes» (DX-014). Hoy solo «Comparar sedes»; las siguientes
 * (cartera, no-show, productividad por profesional) son una línea más en
 * `REPORT_TABS` y su vista en la página. Patrón ARIA de pestañas con
 * activación manual, como la Caja: las flechas mueven el foco y Enter/Espacio
 * (o el clic) eligen.
 */
export const REPORT_TABS = [{ key: 'comparar-sedes', label: 'Comparar sedes' }] as const;

export type ReportTabKey = (typeof REPORT_TABS)[number]['key'];

const copy = {
  tablist: 'Reportes disponibles',
};

/** `?tab=` de la URL → pestaña (un valor desconocido cae en la primera). */
export function resolveReportTab(value: string | null | undefined): ReportTabKey {
  return REPORT_TABS.find((tab) => tab.key === value)?.key ?? REPORT_TABS[0].key;
}

export const reportTabId = (key: ReportTabKey) => `report-tab-${key}`;
export const reportPanelId = (key: ReportTabKey) => `report-panel-${key}`;

export function ReportsTabs({ active, onChange }: { active: ReportTabKey; onChange: (tab: ReportTabKey) => void }) {
  return (
    <TabBar
      aria-label={copy.tablist}
      value={active}
      onValueChange={onChange}
      className="mb-6"
      items={REPORT_TABS.map((tab) => ({
        value: tab.key,
        label: tab.label,
        id: reportTabId(tab.key),
        controls: reportPanelId(tab.key),
      }))}
    />
  );
}
