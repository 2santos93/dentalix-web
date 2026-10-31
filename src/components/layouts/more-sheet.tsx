'use client';
import * as React from 'react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { LogOut, Moon, Sun, UserRound } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { NavGroup } from './nav-config';
import { useCloseOnBack } from './use-shell-media';

const copy = {
  title: 'Más',
  description: 'Todas las secciones, tu cuenta y el tema.',
  account: 'Cuenta',
  profile: 'Mi perfil',
  dark: 'Tema oscuro',
  light: 'Tema claro',
  logout: 'Cerrar sesión',
  loggingOut: 'Cerrando sesión…',
};

/**
 * Hoja «Más» del teléfono: los grupos de la barra lateral (filas de 48 px con
 * icono, etiqueta y contador), y la cuenta (Mi perfil, tema, Cerrar sesión).
 * Sale de abajo, ~75 % del alto, con asa visual. «Atrás» la cierra
 * (`useCloseOnBack`): en una PWA salir de la página por cerrar una hoja es la
 * queja número uno.
 */
export function MoreSheet({
  open,
  onOpenChange,
  groups,
  activeHref,
  accessibleName,
  count,
  onLogout,
  loggingOut,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: NavGroup[];
  activeHref: string | undefined;
  /** Nombre accesible de una entrada (con su contador, si lo hay). */
  accessibleName: (href: string) => string;
  /** Contador visible de una entrada, o `null`. */
  count: (href: string) => React.ReactNode;
  onLogout: () => void;
  loggingOut: boolean;
}) {
  const close = React.useCallback(() => onOpenChange(false), [onOpenChange]);
  const { skipBack } = useCloseOnBack(open, close);
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const navigate = () => {
    // Un enlace ya apila su propia entrada: no hay que deshacer la nuestra.
    skipBack();
    onOpenChange(false);
  };

  const row =
    'flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-[0.9375rem] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        hideClose
        data-testid="more-sheet"
        className="h-[75dvh] max-h-[75dvh] pb-[env(safe-area-inset-bottom)]"
      >
        <div aria-hidden className="flex justify-center pb-1 pt-2">
          <span className="h-1 w-10 rounded-full bg-border" />
        </div>
        <div className="flex items-center justify-between px-5 pb-2">
          <SheetTitle>{copy.title}</SheetTitle>
          <SheetDescription className="sr-only">{copy.description}</SheetDescription>
        </div>
        <nav aria-label={copy.title} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-4">
          {groups.map((group) => (
            <section key={group.id} className="pt-2">
              {group.label && <p className="t-overline px-3 pb-1">{group.label}</p>}
              <ul className="flex flex-col">
                {group.items.map(({ href, label, icon: Icon }) => {
                  const active = href === activeHref;
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        onClick={navigate}
                        aria-current={active ? 'page' : undefined}
                        aria-label={accessibleName(href)}
                        className={cn(
                          row,
                          active
                            ? 'bg-primary-subtle text-primary-subtle-text'
                            : 'text-ink hover:bg-surface-sunken',
                        )}
                      >
                        <Icon className={cn('size-5 shrink-0', !active && 'text-muted')} />
                        <span className="min-w-0 flex-1 truncate">{label}</span>
                        {count(href)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <section className="pt-2">
            <p className="t-overline px-3 pb-1">{copy.account}</p>
            <ul className="flex flex-col">
              <li>
                <Link href="/settings/profile" onClick={navigate} className={cn(row, 'text-ink hover:bg-surface-sunken')}>
                  <UserRound className="size-5 shrink-0 text-muted" />
                  <span className="flex-1">{copy.profile}</span>
                </Link>
              </li>
              <li>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isDark}
                  onClick={() => setTheme(isDark ? 'light' : 'dark')}
                  className={cn(row, 'text-ink hover:bg-surface-sunken')}
                >
                  {isDark ? (
                    <Moon className="size-5 shrink-0 text-muted" aria-hidden />
                  ) : (
                    <Sun className="size-5 shrink-0 text-muted" aria-hidden />
                  )}
                  <span className="flex-1 text-left">{copy.dark}</span>
                  <span
                    aria-hidden
                    className={cn(
                      'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-border transition-colors',
                      isDark ? 'bg-primary' : 'bg-surface-sunken',
                    )}
                  >
                    <span
                      className={cn(
                        'inline-block size-5 rounded-full bg-surface shadow transition-transform',
                        isDark ? 'translate-x-5' : 'translate-x-0.5',
                      )}
                    />
                  </span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={onLogout}
                  disabled={loggingOut}
                  aria-busy={loggingOut}
                  className={cn(row, 'text-danger-text hover:bg-danger-subtle disabled:opacity-60')}
                >
                  <LogOut className="size-5 shrink-0" aria-hidden />
                  <span className="flex-1 text-left">{loggingOut ? copy.loggingOut : copy.logout}</span>
                </button>
              </li>
            </ul>
          </section>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
