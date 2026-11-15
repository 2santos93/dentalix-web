'use client';
import { TabBar } from '@/components/ui/tabs';

export type CashTabKey = 'abonos' | 'turnos' | 'por-confirmar';

const TABS: { key: CashTabKey; label: string }[] = [
  { key: 'abonos', label: 'Abonos' },
  { key: 'turnos', label: 'Turnos' },
  // DX-569: los pagos que reportan los pacientes desde su enlace (PAYMENT_ROLES).
  { key: 'por-confirmar', label: 'Por confirmar' },
];

const copy = {
  tablist: 'Vistas de la caja',
  pendingCount: (n: number) => (n === 1 ? '1 pago por confirmar' : `${n} pagos por confirmar`),
};

/** `?tab=` de la URL → pestaña (cualquier otro valor cae en «Abonos»). */
export function resolveCashTab(value: string | null | undefined): CashTabKey {
  return value === 'turnos' || value === 'por-confirmar' ? value : 'abonos';
}

export const cashTabId = (key: CashTabKey) => `cash-tab-${key}`;
export const cashPanelId = (key: CashTabKey) => `cash-panel-${key}`;

interface CashTabsProps {
  active: CashTabKey;
  onChange: (tab: CashTabKey) => void;
  /** DX-569: sin ella (un rol que no cobra) no hay pestaña «Por confirmar». */
  showReports?: boolean;
  /** Pagos reportados pendientes en la sede activa; `null` mientras no se sabe. */
  pendingReports?: number | null;
}

/**
 * Pestañas de la Caja (DX-027): «Abonos» (la caja del período, DX-002),
 * «Turnos» (apertura y cierre por usuario y sede) y, DX-569, «Por confirmar»
 * (los pagos que reportan los pacientes, con su contador). Patrón ARIA de
 * pestañas con activación manual, como la ficha del paciente: las flechas
 * mueven el foco y Enter/Espacio (o el clic) eligen; cada panel carga datos al
 * montarse.
 */
export function CashTabs({ active, onChange, showReports = false, pendingReports = null }: CashTabsProps) {
  return (
    <TabBar
      aria-label={copy.tablist}
      value={active}
      onValueChange={onChange}
      className="mb-6"
      items={TABS.filter((tab) => tab.key !== 'por-confirmar' || showReports).map((tab) => ({
        value: tab.key,
        label:
          tab.key === 'por-confirmar' && pendingReports ? (
            <span className="inline-flex items-center gap-1.5">
              {tab.label}
              <span
                className="tnum rounded-full bg-surface-active px-1.5 text-xs font-medium text-ink"
                aria-label={copy.pendingCount(pendingReports)}
              >
                {pendingReports}
              </span>
            </span>
          ) : (
            tab.label
          ),
        id: cashTabId(tab.key),
        controls: cashPanelId(tab.key),
      }))}
    />
  );
}
