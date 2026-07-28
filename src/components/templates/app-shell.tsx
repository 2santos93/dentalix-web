'use client';
import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Users, Calendar, LayoutDashboard, UserCog } from 'lucide-react';
import { UserMenu } from '@/components/profile/user-menu';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/patients', label: 'Pacientes', icon: Users },
  { href: '/agenda', label: 'Agenda', icon: Calendar },
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
    <div className="flex min-h-full flex-1">
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

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between gap-4 border-b border-border bg-surface px-4 md:px-8">
          <nav className="flex items-center gap-1 md:hidden">
            <span className="mr-1 text-lg" aria-hidden>
              🦷
            </span>
            {NAV.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(href) ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
                  isActive(href)
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted hover:text-ink',
                )}
              >
                <Icon className="size-4" />
                <span>{label}</span>
              </Link>
            ))}
          </nav>
          <div className="hidden md:block" />
          {/* En móvil el sidebar está oculto: el menú de cuenta (perfil, tema,
              cerrar sesión) vive en el topbar como avatar compacto. */}
          <div className="md:hidden">
            <UserMenu variant="compact" />
          </div>
        </header>

        <main className="flex flex-1 flex-col bg-bg px-4 py-8 md:px-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
