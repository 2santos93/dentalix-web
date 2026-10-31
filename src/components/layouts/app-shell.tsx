'use client';
import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  History,
  ChartColumn,
  FileClock,
  ClipboardCheck,
  ListChecks,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { UserMenu } from '@/components/profile/user-menu';
import { useAuthStore } from '@/lib/auth/auth-store';
import { useSessionBootstrap } from '@/lib/auth/use-session-bootstrap';
import { getTokenRole } from '@/lib/auth/token-role';
import type { ClinicRole } from '@/lib/me/me-api';
import { LocationSwitcher } from '@/components/locations/location-switcher';
import {
  getSidebarCollapsed,
  setSidebarCollapsed,
} from '@/lib/ui/sidebar-store';
import { cn } from '@/lib/utils';
import { SessionLocationsProvider } from '@/lib/locations/session-locations';
import { InClinicProvider, useInClinic } from '@/components/appointments/use-in-clinic';
import { waitingForYouLabel } from '@/lib/appointments/patient-flow';
import { useAnamnesisInboxCount } from '@/components/anamnesis/use-anamnesis-inbox-count';
import { ClosingQueueCountProvider, useClosingQueueCount } from '@/components/appointments/closing-queue-count';
import { CLOSING_QUEUE_HREF, canSeeClosingQueue } from '@/lib/appointments/closing-queue-api';

const ANAMNESIS_HREF = '/anamnesis-por-revisar';

const copy = {
  collapse: 'Colapsar menú',
  expand: 'Expandir menú',
};

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /**
   * Roles que ven la entrada. Sin `roles`, la ven todos. Debe copiar el
   * `@Roles(...)` del endpoint que alimenta la pantalla: el menú solo evita
   * enseñar un enlace que acabaría en 403, la frontera la pone la API.
   */
  roles?: readonly ClinicRole[];
}

// Las entradas sin `roles` (Pacientes, Agenda) son de los cuatro roles. Las
// demás copian el set de la API; antes de DX-070 Dashboard, Catálogo,
// Inventario y Personal no lo llevaban, y recepción veía enlaces que acababan
// en 403.
const NAV: NavItem[] = [
  // DASHBOARD_ROLES: dato financiero agregado, solo gestión.
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['ADMIN'] },
  { href: '/patients', label: 'Pacientes', icon: Users },
  { href: '/agenda', label: 'Agenda', icon: Calendar },
  // DX-439: «Pendiente de cerrar» (CLOSING_QUEUE_ROLES en la API), con su
  // contador: lo que el usuario tiene sin cerrar de días anteriores.
  {
    href: CLOSING_QUEUE_HREF,
    label: 'Pendiente de cerrar',
    icon: ListChecks,
    roles: ['ADMIN', 'DENTIST', 'RECEPTION'],
  },
  // Dato financiero: mismos roles que PAYMENT_ROLES en la API.
  { href: '/caja', label: 'Caja', icon: Wallet, roles: ['ADMIN', 'RECEPTION'] },
  // Cartera por antigüedad (DX-145): RECEIVABLES_ROLES en la API. Vive bajo
  // /caja (es el mismo dato de cobro), pero con su propia entrada.
  { href: '/caja/cartera', label: 'Cartera', icon: HandCoins, roles: ['ADMIN', 'RECEPTION'] },
  // Informe de descuentos (DX-204): DISCOUNT_REPORT_ROLES en la API. Junto a
  // la cartera, bajo /caja.
  { href: '/caja/descuentos', label: 'Descuentos', icon: BadgePercent, roles: ['ADMIN'] },
  // Gastos de la sede (DX-274): EXPENSE_ROLES en la API. Junto a cartera y
  // descuentos, bajo /caja.
  { href: '/caja/gastos', label: 'Gastos', icon: ReceiptText, roles: ['ADMIN'] },
  // Reportes (DX-014): «Comparar sedes» (REPORT_ROLES) y «Producción por
  // procedimiento» (PRODUCTION_REPORT_ROLES, DX-423: el odontólogo ve la suya).
  { href: '/reportes', label: 'Reportes', icon: ChartColumn, roles: ['ADMIN', 'DENTIST'] },
  // Presupuestos por seguir (DX-040): TREATMENT_PLAN_FOLLOW_UP_ROLES en la API.
  {
    href: '/presupuestos',
    label: 'Presupuestos',
    icon: FileClock,
    roles: ['ADMIN', 'RECEPTION'],
  },
  // DX-099: «Anamnesis por revisar» — la bandeja es dato clínico
  // (CLINICAL_ROLES en la API), con su contador.
  {
    href: '/anamnesis-por-revisar',
    label: 'Anamnesis por revisar',
    icon: ClipboardCheck,
    roles: ['ADMIN', 'DENTIST', 'ASSISTANT'],
  },
  // CATALOG_READ_ROLES: recepción no registra clínico.
  {
    href: '/catalog',
    label: 'Catálogo',
    icon: ClipboardList,
    roles: ['ADMIN', 'DENTIST', 'ASSISTANT'],
  },
  // INVENTORY_ROLES.
  { href: '/inventory', label: 'Inventario', icon: Package, roles: ['ADMIN', 'ASSISTANT'] },
  // La pantalla lee `GET /staff/directory`: STAFF_WRITE_ROLES.
  { href: '/staff', label: 'Personal', icon: UserCog, roles: ['ADMIN'] },
  // Registro de auditoría (DX-009): AUDIT_READ_ROLES, lleva IP y user agent.
  { href: '/settings/auditoria', label: 'Auditoría', icon: History, roles: ['ADMIN'] },
];

/**
 * DX-365: títulos de la barra superior móvil para las rutas que no tienen
 * entrada en el menú. Gana el prefijo más largo, como con el menú, así que
 * /settings/auditoria sigue siendo «Auditoría». Copian el título de su página.
 */
const ROUTE_TITLES: { href: string; label: string }[] = [
  { href: '/settings', label: 'Ajustes' },
  { href: '/settings/profile', label: 'Mi perfil' },
];

/** Prefijo de ruta más largo que case con `pathname` (la propia ruta o un padre). */
function longestMatch<T extends { href: string }>(items: readonly T[], pathname: string): T | undefined {
  return items
    .filter(({ href }) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

/**
 * Template: the authenticated app chrome — persistent sidebar (md+), a topbar
 * solo para móvil, y un área de contenido scrollable. Nav highlights the active
 * section via usePathname. Contexto y sesión viven al pie del sidebar en
 * desktop (selector de sede + tarjeta de cuenta) y en el topbar en móvil
 * (selector de sede + avatar compacto).
 *
 * En desktop el sidebar se puede colapsar a un rail de iconos; la preferencia
 * se recuerda en localStorage y en rail nada se pierde: sede y cuenta siguen
 * ahí como iconos.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.accessToken);
  const pathname = usePathname();
  return <SessionLocationsProvider token={token}>
    <InClinicProvider token={token} enabled={getTokenRole(token) === 'DENTIST' || pathname.startsWith('/agenda')}>
      {/* DX-439: una sola lectura del contador para el menú y la Agenda. */}
      <ClosingQueueCountProvider token={token} enabled={canSeeClosingQueue(getTokenRole(token))} pathname={pathname}>
        <AppShellContent>{children}</AppShellContent>
      </ClosingQueueCountProvider>
    </InClinicProvider>
  </SessionLocationsProvider>;
}

function AppShellContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);
  const accessToken = useAuthStore((s) => s.accessToken);
  // Todas las pantallas de la app pasan por aquí: al cargar, la sesión se
  // recupera de la cookie HttpOnly (DX-062). Las páginas esperan a que esté
  // resuelta (`_hasHydrated`) antes de mandar a /login.
  useSessionBootstrap();
  // El rol se resuelve en un efecto y no en el render: el token sale del store
  // en memoria, que en SSR está vacío, y leerlo durante el render haría que el
  // menú del servidor y el del primer render del cliente no coincidieran. Hasta
  // entonces (`null`) las entradas con `roles` no se pintan: mejor aparecer un
  // instante tarde que enseñarle a alguien un enlace que no puede abrir.
  const [role, setRole] = React.useState<ClinicRole | null>(null);
  React.useEffect(() => {
    function hydrate() {
      setRole(getTokenRole(accessToken));
    }
    hydrate();
  }, [accessToken]);
  const nav = NAV.filter((item) => !item.roles || (role !== null && item.roles.includes(role)));
  // DX-200: «Te esperan N» del odontólogo — sus pacientes en espera en la sede
  // activa, con el mismo sondeo que el panel «En clínica». Sin sede, nada.
  const inClinic = useInClinic(accessToken, {
    enabled: role === 'DENTIST',
    silent: true,
    followChanges: true,
  });
  const waitingForYou =
    role === 'DENTIST' && inClinic.view?.scope === 'MINE' ? inClinic.view.waiting.length : 0;
  // DX-099: anamnesis enviadas por los pacientes y aún sin revisar (sus sedes).
  const anamnesisCount = useAnamnesisInboxCount(
    accessToken,
    role === 'ADMIN' || role === 'DENTIST' || role === 'ASSISTANT',
    pathname,
  );
  // DX-439: pendientes de cierre de las secciones de su rol, en sus sedes.
  const closingQueueCount = useClosingQueueCount();
  const closingCount = canSeeClosingQueue(role) ? closingQueueCount : 0;
  /** Contador de bandeja de una entrada (anamnesis, pendiente de cerrar). */
  const inboxCount = (href: string) =>
    href === ANAMNESIS_HREF ? anamnesisCount : href === CLOSING_QUEUE_HREF ? closingCount : 0;
  /** Nombre accesible de una entrada: la Agenda dice además quién espera. */
  const navLabel = (href: string, label: string) =>
    href === '/agenda' && waitingForYou > 0
      ? `${label} · ${waitingForYouLabel(waitingForYou)}`
      : inboxCount(href) > 0
        ? `${label} · ${inboxCount(href)}`
        : label;
  const hasCount = (href: string) => (href === '/agenda' && waitingForYou > 0) || inboxCount(href) > 0;
  // Activa la entrada MÁS específica que case: en /caja/cartera es «Cartera»,
  // no también «Caja».
  const activeHref = longestMatch(nav, pathname)?.href;
  const isActive = (href: string) => href === activeHref;
  // DX-365: título de la barra superior móvil. Sale del menú entero, no del
  // filtrado por rol: quien abre /dashboard por URL sin la entrada sigue
  // sabiendo dónde está (la pantalla ya le dice que no tiene permiso).
  const topbarTitle = longestMatch([...NAV, ...ROUTE_TITLES], pathname)?.label ?? 'Dentalix';

  // Rehidratar la preferencia: localStorage no existe en SSR, así que no puede
  // ser el estado inicial sin romper la hidratación — el primer render en
  // cliente tiene que coincidir con el del servidor (expandido). La lectura va
  // dentro de una función, como en el resto del proyecto.
  React.useEffect(() => {
    function hydrate() {
      setCollapsed(getSidebarCollapsed());
    }
    hydrate();
  }, []);

  function toggleSidebar() {
    const next = !collapsed;
    setCollapsed(next);
    setSidebarCollapsed(next);
  }

  return (
    // El shell se ata a la altura de la ventana (dvh, no vh: en móvil la barra
    // del navegador entra y sale). Sin esto el contenedor crece con el
    // contenido y los `flex-1` de dentro reparten sobre esa altura crecida, así
    // que la agenda no podía "caber" nunca y la página acababa con scroll.
    // Y nada de `flex-1` aquí: siendo hijo flex de <body> (flex-col),
    // `flex: 1 1 0%` haría que mandara el crecimiento y no `h-[100dvh]`.
    <div className="flex h-[100dvh] min-h-0">
      <aside
        className={cn(
          'hidden shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200 md:flex',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        {/* Cabecera: marca + control de colapso. En rail no caben las dos cosas
            en 64px, así que la celda pasa a ser un único botón que muestra el
            diente y lo cambia por el chevron al hover/focus: la marca no
            desaparece y el control sigue estando donde estaba. */}
        <div
          className={cn(
            'flex h-16 items-center',
            collapsed ? 'justify-center px-2' : 'gap-2.5 px-6',
          )}
        >
          {collapsed ? (
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label={copy.expand}
              title={copy.expand}
              className="group flex size-10 items-center justify-center rounded-lg text-muted transition-colors hover:bg-bg hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span
                aria-hidden
                className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-base group-hover:hidden group-focus-visible:hidden"
              >
                🦷
              </span>
              <PanelLeftOpen
                aria-hidden
                className="hidden size-5 group-hover:block group-focus-visible:block"
              />
            </button>
          ) : (
            <>
              <span
                aria-hidden
                className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-base"
              >
                🦷
              </span>
              <span className="text-lg font-semibold text-ink">Dentalix</span>
              <button
                type="button"
                onClick={toggleSidebar}
                aria-label={copy.collapse}
                title={copy.collapse}
                className="-mr-2 ml-auto flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-bg hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <PanelLeftClose aria-hidden className="size-4" />
              </button>
            </>
          )}
        </div>
        <nav
          className={cn(
            // El menú largo cede altura y se desplaza dentro del sidebar;
            // la marca y la cuenta permanecen dentro de la ventana.
            'flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto scroll-py-2 py-2',
            // 63 px interiores − 15 px de barra clásica − 4 px de padding = 44 px útiles;
            // con h-11, cada enlace del carril es un objetivo táctil de 44×44.
            collapsed ? 'px-0.5' : 'px-3',
          )}
        >
          {nav.map(({ href, label, icon: Icon }) => (
            <div key={href} className={cn('relative flex items-center', !collapsed && 'gap-1')}>
            <Link
              href={href}
              aria-current={isActive(href) ? 'page' : undefined}
              // En rail el texto no está, así que el nombre accesible tiene que
              // venir del aria-label; el title lo hace visible al hover.
              aria-label={collapsed || hasCount(href) ? navLabel(href, label) : undefined}
              title={collapsed ? navLabel(href, label) : undefined}
              className={cn(
                'relative flex items-center rounded-lg text-sm font-medium transition-colors',
                collapsed ? 'h-11 w-full justify-center' : 'min-h-10 min-w-0 flex-1 gap-3 px-3 py-2',
                isActive(href)
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted hover:bg-bg hover:text-ink',
              )}
            >
              <Icon className="size-4 shrink-0" />
              {!collapsed && `${label} `}
              {inboxCount(href) > 0 && (
                <InboxCount count={inboxCount(href)} variant={collapsed ? 'rail' : 'full'} />
              )}
            </Link>
            {href === '/agenda' && waitingForYou > 0 && <Link href="/agenda/en-clinica" aria-label={waitingForYouLabel(waitingForYou)} className={cn('rounded-full focus-visible:outline-2 focus-visible:outline-primary', collapsed && 'absolute right-0 -top-1')}>
              <WaitingForYouCount count={waitingForYou} variant={collapsed ? 'rail' : 'full'} />
            </Link>}
            </div>
          ))}
        </nav>
        {/* Pie del sidebar: contexto (sede) encima de identidad (cuenta). El
            selector se autooculta si la clínica solo tiene una sede, y al no
            renderizar nada el `gap` desaparece con él — de ahí gap y no margen
            en la tarjeta. */}
        <div
          className={cn(
            'mt-auto flex flex-col gap-2 border-t border-border p-3',
            collapsed && 'items-center px-2',
          )}
        >
          <LocationSwitcher variant={collapsed ? 'rail' : 'block'} />
          <UserMenu variant={collapsed ? 'rail' : 'card'} />
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Topbar SOLO en móvil: ahí el sidebar está oculto y hace falta un
            sitio para nav, sede y cuenta. En desktop el sidebar los tiene todos,
            así que la barra sobraría — y una banda vacía de 64px le robaría alto
            al contenido. */}
        {/* DX-365: dos filas. Antes todo iba en una: el selector de sede y el
            avatar dejaban al scroller del menú unos 120 px a 390 px y el
            primer enlace se leía «Dashboar», cortado a media palabra.
            Fila 1: dónde estoy (título de la sección), sede y cuenta. El
            título es el único que cede ancho y, si no cabe, se trunca con
            elipsis: el texto entero sigue en el DOM (lo lee el lector de
            pantalla, una sola vez) y en `title`.
            Fila 2: el menú como fila de iconos de 44×44 con nombre accesible y
            `title`, como el rail del sidebar. Sigue desplazándose en
            horizontal si no caben todos, pero lo que asoma en el borde es un
            icono, nunca media palabra. */}
        <header className="border-b border-border bg-surface md:hidden">
          <div className="flex h-14 items-center gap-2 px-4">
            <span className="shrink-0 text-lg" aria-hidden>
              🦷
            </span>
            <p
              data-testid="topbar-title"
              title={topbarTitle}
              className="min-w-0 flex-1 truncate text-base font-semibold text-ink"
            >
              {topbarTitle}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              {/* El selector con el nombre de la sede mide hasta 192 px; por
                  debajo de 380 px no deja sitio al título y pasa a botón de
                  icono (el del rail, con la sede en `title`). */}
              <div className="hidden min-[380px]:contents">
                <LocationSwitcher />
              </div>
              <div className="contents min-[380px]:hidden">
                <LocationSwitcher variant="rail" />
              </div>
              <UserMenu variant="compact" />
            </div>
          </div>
          {/* Scrollable en horizontal: con todas las secciones los iconos suman
              más que el ancho de un móvil, y sin esto desbordan la página. */}
          <nav className="flex min-w-0 items-center gap-1 overflow-x-auto px-3 pb-1">
            {nav.map(({ href, label, icon: Icon }) => (
              <div key={href} className="flex shrink-0 items-center">
              <Link
                href={href}
                aria-current={isActive(href) ? 'page' : undefined}
                aria-label={navLabel(href, label)}
                title={navLabel(href, label)}
                className={cn(
                  'relative flex size-11 shrink-0 items-center justify-center rounded-md transition-colors',
                  isActive(href)
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted hover:text-ink',
                )}
              >
                <Icon className="size-5 shrink-0" />
                {inboxCount(href) > 0 && <InboxCount count={inboxCount(href)} variant="rail" />}
              </Link>
              {href === '/agenda' && waitingForYou > 0 && <Link href="/agenda/en-clinica" aria-label={waitingForYouLabel(waitingForYou)} className="rounded-full focus-visible:outline-2 focus-visible:outline-primary">
                <WaitingForYouCount count={waitingForYou} variant="inline" />
              </Link>}
              </div>
            ))}
          </nav>
        </header>

        {/* `min-h-0` deja que main se encoja por debajo de su contenido; lo que
            sobra scrollea aquí dentro, no en la página: la barra lateral y el
            topbar se quedan fijos.
            `relative` no es decorativo: sin él, un descendiente `absolute` sin
            ancestro posicionado toma como bloque contenedor el documento y lo
            estira. Pasaba con el `sr-only` (que es `position: absolute`) de la
            región aria-live de `Pagination`: en una tabla larga caía fuera de
            la ventana y devolvía el scroll a la página entera. */}
        <main className="relative flex min-h-0 flex-1 flex-col overflow-y-auto bg-bg px-4 py-8 md:px-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

/**
 * DX-200: contador «Te esperan N» del odontólogo en la navegación. Tinte de
 * peligro (no relleno): avisa, no es una acción destructiva. En el rail y en
 * el móvil, solo el número (el nombre accesible del enlace lo dice entero).
 */
function WaitingForYouCount({
  count,
  variant,
}: {
  count: number;
  variant: 'full' | 'rail' | 'inline';
}) {
  return (
    <span
      aria-hidden
      data-testid="waiting-for-you-count"
      className={cn(
        'inline-flex items-center justify-center rounded-full border border-danger/40 bg-danger/10 text-xs font-semibold tabular-nums text-danger',
        variant === 'full' && 'ml-auto px-2 py-0.5',
        variant === 'rail' && 'min-w-5 px-1',
        variant === 'inline' && 'min-w-5 px-1.5',
      )}
    >
      {variant === 'full' ? `Te esperan ${count}` : count}
    </span>
  );
}

/**
 * DX-099: contador de «Anamnesis por revisar». Tinte de aviso (no de peligro):
 * hay trabajo pendiente, no una alerta. El número entero va en el nombre
 * accesible del enlace.
 */
function InboxCount({ count, variant }: { count: number; variant: 'full' | 'rail' | 'inline' }) {
  return (
    <span
      aria-hidden
      data-testid="anamnesis-inbox-count"
      className={cn(
        'inline-flex min-w-5 items-center justify-center rounded-full bg-warning/15 px-1.5 text-xs font-semibold tabular-nums text-ink',
        variant === 'full' && 'ml-auto',
        variant === 'rail' && 'absolute right-0 -top-1',
      )}
    >
      {count}
    </span>
  );
}
