'use client';
import * as React from 'react';
import { TabBar } from '@/components/ui/tabs';
import { getTokenRole } from '@/lib/auth/token-role';

export type CarteraTabKey = 'por-cobrar' | 'saldo-a-favor';

const TABS: { key: CarteraTabKey; label: string }[] = [
  { key: 'por-cobrar', label: 'Por cobrar' },
  { key: 'saldo-a-favor', label: 'Saldo a favor' },
];

const copy = {
  tablist: 'Vistas de la cartera',
};

/** `?tab=` de la URL → pestaña (cualquier otro valor cae en «Por cobrar»). */
export function resolveCarteraTab(value: string | null | undefined): CarteraTabKey {
  return value === 'saldo-a-favor' ? 'saldo-a-favor' : 'por-cobrar';
}

export const carteraTabId = (key: CarteraTabKey) => `cartera-tab-${key}`;
export const carteraPanelId = (key: CarteraTabKey) => `cartera-panel-${key}`;

/** Las pestañas, bajo la cabecera, y el panel que rotulan. */
export interface CarteraViewTabs {
  nav: React.ReactNode;
  panelId: string;
  tabId: string;
}

/** Atributos ARIA del panel de una vista que vive bajo pestañas. */
export function carteraPanelProps(tabs: CarteraViewTabs | undefined) {
  return tabs
    ? ({
        role: 'tabpanel',
        id: tabs.panelId,
        'aria-labelledby': tabs.tabId,
      } as const)
    : {};
}

/**
 * Las pestañas solo se pintan al rol que tiene Cartera (ADMIN y RECEPTION),
 * leído SÍNCRONO del token de sesión: un rol clínico que llega por URL no ve
 * las pestañas ni un instante, antes de que la API responda 403. Un rol que
 * no se pudo leer cuenta como sin permiso (`getTokenRole`).
 */
export function carteraNavFor(
  token: string,
  tabs: CarteraViewTabs | undefined,
): React.ReactNode {
  const role = getTokenRole(token);
  return role === 'ADMIN' || role === 'RECEPTION' ? tabs?.nav : null;
}

interface CarteraTabsProps {
  active: CarteraTabKey;
  onChange: (tab: CarteraTabKey) => void;
}

/**
 * Pestañas de la cartera (DX-430): «Por cobrar» (lo que deben, por antigüedad)
 * y «Saldo a favor» (a quién se le debe dinero). Mismo patrón ARIA que las de
 * la Caja y los gastos: activación manual, las flechas mueven el foco y
 * Enter/Espacio (o el clic) eligen.
 */
export function CarteraTabs({ active, onChange }: CarteraTabsProps) {
  return (
    <TabBar
      aria-label={copy.tablist}
      value={active}
      onValueChange={onChange}
      className="mb-6"
      items={TABS.map((tab) => ({
        value: tab.key,
        label: tab.label,
        id: carteraTabId(tab.key),
        controls: carteraPanelId(tab.key),
      }))}
    />
  );
}
