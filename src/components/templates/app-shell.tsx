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
} from 'lucide-react';
import { UserMenu } from '@/components/profile/user-menu';
import { LocationSwitcher } from '@/components/locations/location-switcher';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/patients', label: 'Pacientes', icon: Users },
  { href: '/agenda', label: 'Agenda', icon: Calendar },
  { href: '/catalog', label: 'Catálogo', icon: ClipboardList },
  { href: '/inventory', label: 'Inventario', icon: Package },
  { href: '/staff', label: 'Personal', icon: UserCog },
];

/**
 * Template: the authenticated app chrome — persistent sidebar (md+), a top bar
 * with the theme switch, and a scrollable content area. Nav highlights the
 * active section via usePathname. Session controls (perfil, tema, cerrar
 * sesión) viven en el `UserMenu`: tarjeta al pie del sidebar en desktop y
 * avatar compacto en el topbar en móvil.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    // El shell se ata a la altura de la ventana (dvh, no vh: en móvil la barra
    // del navegador entra y sale). Sin esto el contenedor crece con el
    // contenido y los `flex-1` de dentro reparten sobre esa altura crecida, así
    // que la agenda no podía "caber" nunca y la página acababa con scroll.
    // Y nada de `flex-1` aquí: siendo hijo flex de <body> (flex-col),
    // `flex: 1 1 0%` haría que mandara el crecimiento y no `h-[100dvh]`.
    <div className="flex h-[100dvh] min-h-0">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
        <div className="flex h-16 items-center gap-2.5 px-6 text-lg font-semibold text-ink">
          <span
            aria-hidden
            className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-base"
          >
            🦷
          </span>
          Dentalix
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive(href)
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted hover:bg-bg hover:text-ink',
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t border-border p-3">
          <UserMenu variant="card" />
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between gap-4 border-b border-border bg-surface px-4 md:px-8">
          {/* Scrollable en horizontal: con 6 secciones los ítems suman más que
              el ancho de un móvil, y sin esto desbordan la página entera. */}
          <nav className="-mx-1 flex min-w-0 items-center gap-1 overflow-x-auto px-1 md:hidden">
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
          {/* En desktop este hueco del topbar lo ocupa el selector de sede
              (que se autooculta si la clínica solo tiene una). */}
          <div className="hidden md:block">
            <LocationSwitcher />
          </div>
          {/* En móvil el sidebar está oculto: el menú de cuenta (perfil, tema,
              cerrar sesión) vive en el topbar como avatar compacto. */}
          <div className="flex shrink-0 items-center gap-2 md:hidden">
            <LocationSwitcher />
            <UserMenu variant="compact" />
          </div>
        </header>

        {/* `min-h-0` deja que main se encoja por debajo de su contenido; lo que
            sobra scrollea aquí dentro, no en la página: la barra lateral y el
            topbar se quedan fijos. */}
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-bg px-4 py-8 md:px-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
