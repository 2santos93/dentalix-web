'use client';
import { TabBar } from '@/components/ui/tabs';

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
  return (
    <TabBar
      aria-label={copy.tablist}
      value={active}
      onValueChange={onChange}
      className="mb-6"
      items={TABS.map((tab) => ({
        value: tab.key,
        label: tab.label,
        id: scheduleTabId(tab.key),
        controls: schedulePanelId(tab.key),
      }))}
    />
  );
}
