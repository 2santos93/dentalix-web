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
  History,
  FileClock,
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
import { useInClinic } from '@/components/appointments/use-in-clinic';
import { waitingForYouLabel } from '@/lib/appointments/patient-flow';

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
  // Dato financiero: mismos roles que PAYMENT_ROLES en la API.
  { href: '/caja', label: 'Caja', icon: Wallet, roles: ['ADMIN', 'RECEPTION'] },
  // Cartera por antigüedad (DX-145): RECEIVABLES_ROLES en la API. Vive bajo
  // /caja (es el mismo dato de cobro), pero con su propia entrada.
  { href: '/caja/cartera', label: 'Cartera', icon: HandCoins, roles: ['ADMIN', 'RECEPTION'] },
  // Informe de descuentos (DX-204): DISCOUNT_REPORT_ROLES en la API. Junto a
  // la cartera, bajo /caja.
  { href: '/caja/descuentos', label: 'Descuentos', icon: BadgePercent, roles: ['ADMIN'] },
  // Presupuestos por seguir (DX-040): TREATMENT_PLAN_FOLLOW_UP_ROLES en la API.
  {
    href: '/presupuestos',
    label: 'Presupuestos',
    icon: FileClock,
    roles: ['ADMIN', 'RECEPTION'],
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
  /** Nombre accesible de una entrada: la Agenda dice además quién espera. */
  const navLabel = (href: string, label: string) =>
    href === '/agenda' && waitingForYou > 0 ? `${label} · ${waitingForYouLabel(waitingForYou)}` : label;
  // Activa la entrada MÁS específica que case: en /caja/cartera es «Cartera»,
  // no también «Caja».
  const activeHref = nav
    .map((item) => item.href)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];
  const isActive = (href: string) => href === activeHref;

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
            'flex flex-1 flex-col gap-1 py-2',
            collapsed ? 'px-2' : 'px-3',
          )}
        >
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? 'page' : undefined}
              // En rail el texto no está, así que el nombre accesible tiene que
              // venir del aria-label; el title lo hace visible al hover.
              aria-label={collapsed || (href === '/agenda' && waitingForYou > 0) ? navLabel(href, label) : undefined}
              title={collapsed ? navLabel(href, label) : undefined}
              className={cn(
                'relative flex items-center rounded-lg text-sm font-medium transition-colors',
                collapsed ? 'h-10 justify-center' : 'gap-3 px-3 py-2',
                isActive(href)
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted hover:bg-bg hover:text-ink',
              )}
            >
              <Icon className="size-4 shrink-0" />
              {!collapsed && label}
              {href === '/agenda' && waitingForYou > 0 ? (
                <WaitingForYouCount count={waitingForYou} variant={collapsed ? 'rail' : 'full'} />
              ) : null}
            </Link>
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
        <header className="flex h-16 items-center justify-between gap-4 border-b border-border bg-surface px-4 md:hidden">
          {/* Scrollable en horizontal: con 7 secciones los ítems suman más que
              el ancho de un móvil, y sin esto desbordan la página entera. */}
          <nav className="-mx-1 flex min-w-0 items-center gap-1 overflow-x-auto px-1">
            <span className="mr-1 shrink-0 text-lg" aria-hidden>
              🦷
            </span>
            {nav.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(href) ? 'page' : undefined}
                aria-label={href === '/agenda' && waitingForYou > 0 ? navLabel(href, label) : undefined}
                className={cn(
                  'flex h-11 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors',
                  isActive(href)
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted hover:text-ink',
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span>{label}</span>
                {href === '/agenda' && waitingForYou > 0 ? (
                  <WaitingForYouCount count={waitingForYou} variant="inline" />
                ) : null}
              </Link>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <LocationSwitcher />
            <UserMenu variant="compact" />
          </div>
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
        variant === 'rail' && 'absolute -right-1 -top-1 min-w-5 px-1',
        variant === 'inline' && 'min-w-5 px-1.5',
      )}
    >
      {variant === 'full' ? `Te esperan ${count}` : count}
    </span>
  );
}
