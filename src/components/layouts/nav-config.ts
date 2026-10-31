import type { ComponentType } from 'react';
import {
  Users,
  Calendar,
  LayoutDashboard,
  UserCog,
  ClipboardList,
  Package,
  Wallet,
  HandCoins,
  BadgePercent,
  ReceiptText,
  ChartColumn,
  FileClock,
  ClipboardCheck,
  ListChecks,
  Settings,
} from 'lucide-react';
import type { ClinicRole } from '@/lib/me/me-api';
import { CLOSING_QUEUE_HREF } from '@/lib/appointments/closing-queue-api';

export const ANAMNESIS_HREF = '/anamnesis-por-revisar';
export { CLOSING_QUEUE_HREF };

export interface NavItem {
  href: string;
  /** Texto visible. Corto: una entrada nunca parte en dos líneas. */
  label: string;
  /**
   * Nombre completo cuando el visible está abreviado («Anamnesis» →
   * «Anamnesis por revisar»). Va al nombre accesible y al `title`.
   */
  fullLabel?: string;
  /** Etiqueta en la barra inferior del móvil, si difiere («Dashboard» → «Inicio»). */
  tabLabel?: string;
  icon: ComponentType<{ className?: string }>;
  /**
   * Roles que ven la entrada. Sin `roles`, la ven todos. Debe copiar el
   * `@Roles(...)` del endpoint que alimenta la pantalla: el menú solo evita
   * enseñar un enlace que acabaría en 403, la frontera la pone la API.
   */
  roles?: readonly ClinicRole[];
}

export interface NavGroup {
  id: 'main' | 'care' | 'finance' | 'clinic' | 'admin';
  /** Sin título: el primer grupo (lo de todos los días). */
  label: string | null;
  items: NavItem[];
}

// Las entradas sin `roles` (Pacientes, Agenda, Ajustes) son de los cuatro
// roles. Las demás copian el set de la API; antes de DX-070 Dashboard,
// Catálogo, Inventario y Personal no lo llevaban, y recepción veía enlaces que
// acababan en 403.
// Inicio (I1): la pantalla de arranque de los CUATRO roles. Cada bloque pide
// solo los endpoints que su rol puede leer (`components/dashboard/inicio-
// roles.ts`); `GET /dashboard` (dato financiero, DASHBOARD_ROLES) sigue siendo
// solo de ADMIN y nadie más lo llama.
const DASHBOARD: NavItem = {
  href: '/dashboard',
  label: 'Inicio',
  icon: LayoutDashboard,
};
const AGENDA: NavItem = { href: '/agenda', label: 'Agenda', icon: Calendar };
const PATIENTS: NavItem = { href: '/patients', label: 'Pacientes', icon: Users };
// DX-439: «Pendiente de cerrar» (CLOSING_QUEUE_ROLES en la API, como
// `canSeeClosingQueue`), con su contador: lo que el usuario tiene sin cerrar de
// días anteriores. Vive bajo /agenda y abre «Atención»: es el cierre del día.
const CLOSING_QUEUE: NavItem = {
  href: CLOSING_QUEUE_HREF,
  label: 'Pendiente de cerrar',
  icon: ListChecks,
  roles: ['ADMIN', 'DENTIST', 'RECEPTION'],
};
// Presupuestos por seguir (DX-040): TREATMENT_PLAN_FOLLOW_UP_ROLES en la API.
const QUOTES: NavItem = {
  href: '/presupuestos',
  label: 'Presupuestos',
  icon: FileClock,
  roles: ['ADMIN', 'RECEPTION'],
};
// DX-099: la bandeja es dato clínico (CLINICAL_ROLES en la API), con contador.
const ANAMNESIS: NavItem = {
  href: ANAMNESIS_HREF,
  label: 'Anamnesis',
  fullLabel: 'Anamnesis por revisar',
  icon: ClipboardCheck,
  roles: ['ADMIN', 'DENTIST', 'ASSISTANT'],
};
// Dato financiero: mismos roles que PAYMENT_ROLES en la API.
const CASH: NavItem = { href: '/caja', label: 'Caja', icon: Wallet, roles: ['ADMIN', 'RECEPTION'] };
// Cartera por antigüedad (DX-145): RECEIVABLES_ROLES. Vive bajo /caja.
const RECEIVABLES: NavItem = {
  href: '/caja/cartera',
  label: 'Cartera',
  icon: HandCoins,
  roles: ['ADMIN', 'RECEPTION'],
};
// Gastos de la sede (DX-274): EXPENSE_ROLES.
const EXPENSES: NavItem = { href: '/caja/gastos', label: 'Gastos', icon: ReceiptText, roles: ['ADMIN'] };
// Informe de descuentos (DX-204): DISCOUNT_REPORT_ROLES.
const DISCOUNTS: NavItem = {
  href: '/caja/descuentos',
  label: 'Descuentos',
  icon: BadgePercent,
  roles: ['ADMIN'],
};
// Reportes (DX-014): «Comparar sedes» (REPORT_ROLES) y «Producción por
// procedimiento» (PRODUCTION_REPORT_ROLES, DX-423: el odontólogo ve la suya).
const REPORTS: NavItem = { href: '/reportes', label: 'Reportes', icon: ChartColumn, roles: ['ADMIN', 'DENTIST'] };
// CATALOG_READ_ROLES: recepción no registra clínico.
const CATALOG: NavItem = {
  href: '/catalog',
  label: 'Catálogo',
  icon: ClipboardList,
  roles: ['ADMIN', 'DENTIST', 'ASSISTANT'],
};
// INVENTORY_ROLES.
const INVENTORY: NavItem = { href: '/inventory', label: 'Inventario', icon: Package, roles: ['ADMIN', 'ASSISTANT'] };
// La pantalla lee `GET /staff/directory`: STAFF_WRITE_ROLES.
const STAFF: NavItem = { href: '/staff', label: 'Personal', icon: UserCog, roles: ['ADMIN'] };
// Índice de ajustes: lo abren todos (cada pantalla filtra sus entradas por rol).
// La Auditoría (DX-009) vive ahí, en «Herramientas y registros» (M2: dejó la barra
// para que «Pendiente de cerrar» quepa a 900 px; DESIGN.md → Navigation).
const SETTINGS: NavItem = { href: '/settings', label: 'Ajustes', icon: Settings };

/**
 * IA v2 (SPEC «Navegación»): agrupada por momento del trabajo. El orden de los
 * grupos y de sus entradas es el de la barra lateral y la hoja «Más».
 */
export const NAV_GROUPS: readonly NavGroup[] = [
  { id: 'main', label: null, items: [DASHBOARD, AGENDA, PATIENTS] },
  { id: 'care', label: 'Atención', items: [CLOSING_QUEUE, QUOTES, ANAMNESIS] },
  { id: 'finance', label: 'Finanzas', items: [CASH, RECEIVABLES, EXPENSES, DISCOUNTS, REPORTS] },
  { id: 'clinic', label: 'Clínica', items: [CATALOG, INVENTORY] },
  { id: 'admin', label: 'Administración', items: [STAFF, SETTINGS] },
];

export const ALL_NAV_ITEMS: readonly NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** ¿Ve `role` la entrada? Sin rol resuelto (`null`) solo las de todos. */
export function canSee(item: NavItem, role: ClinicRole | null): boolean {
  return !item.roles || (role !== null && item.roles.includes(role));
}

/** Los grupos con lo que `role` puede abrir; un grupo vacío desaparece. */
export function visibleNavGroups(role: ClinicRole | null): NavGroup[] {
  return NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => canSee(i, role)) })).filter(
    (g) => g.items.length > 0,
  );
}

/**
 * Preferencias de la barra inferior del móvil por rol (SPEC): cuatro destinos
 * y «Más». Si el rol no ve uno, se salta y entra el siguiente que sí vea de la
 * lista de reserva (el orden del menú), así que siempre salen cuatro mientras
 * existan.
 */
// I1: Inicio va primero para todos (sus pendientes ya cuentan presupuestos,
// anamnesis e inventario, que pasan a «Más» cuando no caben).
const TAB_PREFERENCES: Record<ClinicRole, string[]> = {
  ADMIN: ['/dashboard', '/agenda', '/patients', '/caja'],
  RECEPTION: ['/dashboard', '/agenda', '/patients', '/caja', '/presupuestos'],
  // `/catalog` explícito: desde DX-423 el odontólogo también ve Reportes, que
  // va antes en el orden del menú y le quitaría la pestaña al catálogo.
  DENTIST: ['/dashboard', '/agenda', '/patients', ANAMNESIS_HREF, '/presupuestos', '/inventory', '/catalog'],
  ASSISTANT: ['/dashboard', '/agenda', '/patients', ANAMNESIS_HREF, '/presupuestos', '/inventory'],
};

export const TAB_COUNT = 4;

export function bottomTabsFor(role: ClinicRole | null): NavItem[] {
  const visible = ALL_NAV_ITEMS.filter((i) => canSee(i, role) && i.href !== SETTINGS.href);
  const prefs = role ? TAB_PREFERENCES[role] : ['/dashboard', '/agenda', '/patients'];
  const picked: NavItem[] = [];
  for (const href of prefs) {
    const item = visible.find((i) => i.href === href);
    if (item && picked.length < TAB_COUNT) picked.push(item);
  }
  for (const item of visible) {
    if (picked.length >= TAB_COUNT) break;
    if (!picked.includes(item)) picked.push(item);
  }
  // Orden del menú, no el de preferencia: Agenda siempre antes que Pacientes…
  return picked.sort((a, b) => ALL_NAV_ITEMS.indexOf(a) - ALL_NAV_ITEMS.indexOf(b));
}

/** Prefijo de ruta más largo que case con `pathname` (la propia ruta o un padre). */
export function longestMatch<T extends { href: string }>(items: readonly T[], pathname: string): T | undefined {
  return items
    .filter(({ href }) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
