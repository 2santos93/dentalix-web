'use client';
import type { ClinicRole } from '@/lib/me/me-api';
import type { ExtraPermission } from '@/lib/auth/permissions';
import { TabBar } from '@/components/ui/tabs';

/**
 * Pestañas de «Reportes» (DX-014): «Comparar sedes» (solo ADMIN),
 * «Producción por procedimiento» (DX-423: ADMIN y DENTIST, que ve solo la
 * suya), «Cobrado sin imputar» (DX-399: ADMIN y recepción) y «Huecos
 * recuperados» (DX-436: ADMIN), «Ocupación por sillón» (DX-481: ADMIN) y
 * «Enlaces del paciente» (DX-424: ADMIN) y «Presupuestos» (DX-558: ADMIN,
 * DENTIST, que ve los que elaboró, y FINANCIAL_REPORTS_VIEW) y «Previsión» (DX-567: los mismos, el
 * DENTIST con lo suyo) y «Captación» (DX-172: ADMIN y FINANCIAL_REPORTS_VIEW). Las siguientes son una línea más en `REPORT_TABS` y su vista en la
 * página. Patrón ARIA de pestañas con activación manual, como la Caja: las
 * flechas mueven el foco y Enter/Espacio (o el clic) eligen.
 */
export const REPORT_TABS = [
  // DX-090: las financieras también con FINANCIAL_REPORTS_VIEW (`@AllowPermissions` en la API).
  { key: 'comparar-sedes', label: 'Comparar sedes', roles: ['ADMIN'], permissions: ['FINANCIAL_REPORTS_VIEW'] },
  // DX-410: ingresos − gastos por sede en base Caja o Devengo; administración (PROFITABILITY_REPORT_ROLES).
  { key: 'rentabilidad', label: 'Rentabilidad', roles: ['ADMIN'], permissions: ['FINANCIAL_REPORTS_VIEW'] },
  { key: 'produccion', label: 'Producción por procedimiento', roles: ['ADMIN', 'DENTIST'] },
  // DX-558: embudo de presupuestos; ADMIN y FINANCIAL_REPORTS_VIEW, toda la clínica; DENTIST, los que elaboró (QUOTE_FUNNEL_REPORT_ROLES).
  {
    key: 'presupuestos',
    label: 'Presupuestos',
    roles: ['ADMIN', 'DENTIST'],
    permissions: ['FINANCIAL_REPORTS_VIEW'],
  },
  // DX-567: lo agendado y la previsión del mes; ADMIN y FINANCIAL_REPORTS_VIEW, toda la clínica; DENTIST, lo suyo (SCHEDULED_PRODUCTION_REPORT_ROLES).
  {
    key: 'prevision',
    label: 'Previsión',
    roles: ['ADMIN', 'DENTIST'],
    permissions: ['FINANCIAL_REPORTS_VIEW'],
  },
  // DX-172: pacientes nuevos y lo cobrado por «¿Cómo nos conoció?»; ADMIN y FINANCIAL_REPORTS_VIEW (ACQUISITION_REPORT_ROLES).
  { key: 'captacion', label: 'Captación', roles: ['ADMIN'], permissions: ['FINANCIAL_REPORTS_VIEW'] },
  // DX-399: lo cobrado que aún no cubre ningún ítem; los roles de cobro (UNALLOCATED_PAYMENTS_ROLES).
  {
    key: 'sin-imputar',
    label: 'Cobrado sin imputar',
    roles: ['ADMIN', 'RECEPTION'],
    permissions: ['FINANCIAL_REPORTS_VIEW'],
  },
  // DX-436: los huecos que dejan las cancelaciones y cuántos se recuperan; administración (las restringidas, solo sus sedes).
  { key: 'huecos-recuperados', label: 'Huecos recuperados', roles: ['ADMIN'] },
  // DX-481: minutos abiertos, reservados y atendidos de cada sillón; administración (REPORT_ROLES).
  { key: 'ocupacion-sillones', label: 'Ocupación por sillón', roles: ['ADMIN'] },
  // DX-424: enviados, abiertos y completados de los enlaces al paciente; administración (REPORT_ROLES).
  { key: 'enlaces-paciente', label: 'Enlaces del paciente', roles: ['ADMIN'] },
] as const satisfies readonly {
  key: string;
  label: string;
  roles: readonly ClinicRole[];
  permissions?: readonly ExtraPermission[];
}[];

export type ReportTabKey = (typeof REPORT_TABS)[number]['key'];
export type ReportTab = (typeof REPORT_TABS)[number];

/**
 * Las pestañas que el rol puede abrir (copian los `@Roles` de la API y, DX-090,
 * sus `@AllowPermissions`: `permissions` son los efectivos de `GET /me`). Un rol
 * sin ninguna ve la primera, cuyo 403 enseña el aviso de la propia vista.
 */
export function reportTabsFor(
  role: ClinicRole | null,
  permissions: readonly ExtraPermission[] = [],
): readonly ReportTab[] {
  const tabs = REPORT_TABS.filter(
    (tab) =>
      role !== null &&
      ((tab.roles as readonly ClinicRole[]).includes(role) ||
        ('permissions' in tab && (tab.permissions as readonly ExtraPermission[]).some((p) => permissions.includes(p)))),
  );
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
