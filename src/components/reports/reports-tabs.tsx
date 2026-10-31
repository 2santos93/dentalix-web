'use client';
import type { ClinicRole } from '@/lib/me/me-api';
import { TabBar } from '@/components/ui/tabs';

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
  return (
    <TabBar
      aria-label={copy.tablist}
      value={active}
      onValueChange={onChange}
      className="mb-6"
      items={tabs.map((tab) => ({
        value: tab.key,
        label: tab.label,
        id: reportTabId(tab.key),
        controls: reportPanelId(tab.key),
      }))}
    />
  );
}
