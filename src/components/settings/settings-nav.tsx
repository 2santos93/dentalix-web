'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { cn } from '@/lib/utils';
import { SETTINGS_BACK, visibleSettingsSections } from './settings-sections';

export const settingsNavCopy = {
  label: 'Ajustes',
};

/** La entrada activa: la ruta exacta o una de sus hijas (`/settings/listas-de-precios/123`). */
export function isActiveSettingsHref(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Sub-navegación persistente de Ajustes (B6, DESIGN.md → Settings pages): en
 * escritorio ancho (`xl`, ≥ 1280 px) va a la izquierda de cada pantalla de
 * ajustes con los mismos grupos que el índice, así saltar de Pagadores a
 * Convenios es un clic y no «atrás → índice → otra». Por debajo de `xl` no se
 * pinta: el índice es la entrada y cada pantalla lleva «← Ajustes».
 *
 * Etiquetas solas (sin descripciones ni iconos): es navegación, no un índice
 * para leer. Activa = `primary-subtle` + `primary-subtle-text`, como la barra
 * lateral. Su cabecera «Ajustes» enlaza al índice: sustituye a «← Ajustes».
 */
export function SettingsNav({ className }: { className?: string }) {
  const pathname = usePathname() ?? '';
  const token = useAuthStore((s) => s.accessToken);
  const sections = visibleSettingsSections(getTokenRole(token));

  return (
    <nav aria-label={settingsNavCopy.label} className={cn('flex flex-col gap-4', className)}>
      <Link
        href={SETTINGS_BACK.href}
        className="t-title self-start rounded-sm text-ink hover:text-primary-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text"
      >
        {SETTINGS_BACK.label}
      </Link>
      {sections.map((section) => {
        const headingId = `settings-nav-${section.id}`;
        return (
          <div key={section.id} className="flex flex-col gap-0.5">
            <p id={headingId} className="t-caption px-2 pb-1 text-muted">
              {section.title}
            </p>
            <ul aria-labelledby={headingId} className="flex flex-col gap-0.5">
              {section.entries.map((entry) => {
                const active = isActiveSettingsHref(pathname, entry.href);
                return (
                  <li key={entry.href}>
                    <Link
                      href={entry.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex min-h-8 items-center rounded-md px-2 py-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary-text',
                        active
                          ? 'bg-primary-subtle font-medium text-primary-subtle-text'
                          : 'text-ink hover:bg-surface-sunken',
                      )}
                    >
                      {entry.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

/**
 * El marco de Ajustes (lo monta `src/app/(app)/settings/layout.tsx`): en `xl`
 * la sub-navegación (220 px, pegajosa, con su propio scroll) y la pantalla a la
 * derecha. En el índice (`/settings`) no hay sub-navegación: el índice ya es
 * el mapa.
 */
export function SettingsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  if (pathname === SETTINGS_BACK.href) return <>{children}</>;
  return (
    <div className="xl:grid xl:grid-cols-[13.75rem_minmax(0,1fr)] xl:gap-10">
      <div className="hidden xl:block">
        <div className="sticky top-0 max-h-[calc(100dvh-4rem)] overflow-y-auto border-r border-border-subtle pr-4 pb-4">
          <SettingsNav />
        </div>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
