/**
 * Preferencia de sidebar colapsado (rail de iconos). Vive en localStorage para
 * que sobreviva a recargas y navegaciones: es una preferencia de la persona,
 * no estado de una vista.
 *
 * No hay bus de eventos como en `location-store` a propósito: el único
 * consumidor es el `AppShell`, que monta una sola vez por pestaña. Si algún día
 * lo lee otro componente, ese será el momento de añadirlo.
 */
const KEY = 'dentalix.sidebarCollapsed';

export function getSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(KEY) === '1';
}

export function setSidebarCollapsed(collapsed: boolean): void {
  if (typeof window === 'undefined') return;
  if (collapsed) window.localStorage.setItem(KEY, '1');
  else window.localStorage.removeItem(KEY);
}
