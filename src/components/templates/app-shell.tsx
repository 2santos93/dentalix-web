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
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { UserMenu } from '@/components/profile/user-menu';
import { LocationSwitcher } from '@/components/locations/location-switcher';
import {
  getSidebarCollapsed,
  setSidebarCollapsed,
} from '@/lib/ui/sidebar-store';
import { cn } from '@/lib/utils';

const copy = {
  collapse: 'Colapsar menú',
  expand: 'Expandir menú',
};

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/patients', label: 'Pacientes', icon: Users },
  { href: '/agenda', label: 'Agenda', icon: Calendar },
  { href: '/catalog', label: 'Catálogo', icon: ClipboardList },
  { href: '/inventory', label: 'Inventario', icon: Package },
  { href: '/staff', label: 'Personal', icon: UserCog },
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
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

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
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? 'page' : undefined}
              // En rail el texto no está, así que el nombre accesible tiene que
              // venir del aria-label; el title lo hace visible al hover.
              aria-label={collapsed ? label : undefined}
              title={collapsed ? label : undefined}
              className={cn(
                'flex items-center rounded-lg text-sm font-medium transition-colors',
                collapsed ? 'h-10 justify-center' : 'gap-3 px-3 py-2',
                isActive(href)
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted hover:bg-bg hover:text-ink',
              )}
            >
              <Icon className="size-4 shrink-0" />
              {!collapsed && label}
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
          {/* Scrollable en horizontal: con 6 secciones los ítems suman más que
              el ancho de un móvil, y sin esto desbordan la página entera. */}
          <nav className="-mx-1 flex min-w-0 items-center gap-1 overflow-x-auto px-1">
            <span className="mr-1 shrink-0 text-lg" aria-hidden>
              🦷
            </span>
            {NAV.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(href) ? 'page' : undefined}
                className={cn(
                  'flex h-11 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors',
                  isActive(href)
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted hover:text-ink',
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span>{label}</span>
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
