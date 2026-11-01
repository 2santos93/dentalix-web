'use client';
import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Ellipsis, PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react';
import { UserMenu, useLogout } from '@/components/profile/user-menu';
import { useAuthStore } from '@/lib/auth/auth-store';
import { useSessionBootstrap } from '@/lib/auth/use-session-bootstrap';
import { getTokenRole } from '@/lib/auth/token-role';
import type { ClinicRole } from '@/lib/me/me-api';
import { LocationSwitcher } from '@/components/locations/location-switcher';
import { getSidebarCollapsed, setSidebarCollapsed } from '@/lib/ui/sidebar-store';
import { cn } from '@/lib/utils';
import { SessionLocationsProvider } from '@/lib/locations/session-locations';
import { SedeDateLocaleProvider } from '@/components/locations/sede-date-locale-provider';
import { InClinicProvider, useInClinic } from '@/components/appointments/use-in-clinic';
import { waitingForYouLabel } from '@/lib/appointments/patient-flow';
import { useClosingQueueCount } from '@/components/appointments/closing-queue-count';
import { WorkQueuesProvider, useWorkQueueCount } from '@/components/work-queues/work-queues-context';
import { canSeeClosingQueue } from '@/lib/appointments/closing-queue-api';
import { useClinicBranding } from '@/components/brand/branding-context';
import { ClinicBrand, ClinicLogo } from '@/components/brand/clinic-brand';
import { Logo } from '@/components/ui/logo';
import {
  ALL_NAV_ITEMS,
  ANAMNESIS_HREF,
  CLOSING_QUEUE_HREF,
  bottomTabsFor,
  longestMatch,
  visibleNavGroups,
  type NavGroup,
} from './nav-config';
import { CommandPalette, ShortcutHint } from './command-palette';
import { MoreSheet } from './more-sheet';
import { TABLET_QUERY, useMediaQuery, useVirtualKeyboardOpen } from './use-shell-media';

const copy = {
  collapse: 'Colapsar menú',
  expand: 'Expandir menú',
  search: 'Buscar',
  searchLong: 'Buscar…',
  more: 'Más',
  mainNav: 'Principal',
  sections: 'Secciones',
};

/**
 * Template: el chrome autenticado (DESIGN.md → Navigation, SPEC «Navegación»).
 *
 * - Escritorio (≥1024): barra lateral agrupada (Atención, Finanzas, Clínica,
 *   Administración), plegable a raíl de iconos; la preferencia se recuerda.
 * - Tableta (768–1023): la misma barra, en raíl por defecto; se despliega sin
 *   tocar la preferencia de escritorio.
 * - Teléfono (<768): barra superior compacta (marca de la clínica, sede,
 *   búsqueda, cuenta) y barra inferior con cuatro destinos según el rol +
 *   «Más» (hoja con el resto). El título de la página es su H1.
 * - En todas: paleta de comandos con ⌘K / Ctrl+K.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.accessToken);
  const pathname = usePathname();
  return <SessionLocationsProvider token={token}>
    <InClinicProvider token={token} enabled={getTokenRole(token) === 'DENTIST' || pathname.startsWith('/agenda')}>
      <SedeDateLocaleProvider token={token}>
        {/* DX-503: una sola lectura de las listas de trabajo para el menú, la Agenda e Inicio. */}
        <WorkQueuesProvider token={token} pathname={pathname}>
          <AppShellContent>{children}</AppShellContent>
        </WorkQueuesProvider>
      </SedeDateLocaleProvider>
    </InClinicProvider>
  </SessionLocationsProvider>;
}

function AppShellContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const accessToken = useAuthStore((s) => s.accessToken);
  const branding = useClinicBranding();
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
  const groups = visibleNavGroups(role);
  const nav = groups.flatMap((g) => g.items);
  const tabs = bottomTabsFor(role);

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
  // DX-503: sale de la misma lectura que «Mi día» (WorkQueuesProvider).
  const anamnesisCount = useWorkQueueCount('ANAMNESIS_REVIEW');
  // DX-439: pendientes de cierre de las secciones de su rol, en sus sedes.
  const closingQueueCount = useClosingQueueCount();
  const closingCount = canSeeClosingQueue(role) ? closingQueueCount : 0;
  /** Contador de bandeja de una entrada (anamnesis, pendiente de cerrar). */
  const inboxCount = (href: string) =>
    href === ANAMNESIS_HREF ? anamnesisCount : href === CLOSING_QUEUE_HREF ? closingCount : 0;
  const fullLabel = (href: string) => {
    const item = ALL_NAV_ITEMS.find((i) => i.href === href);
    return item?.fullLabel ?? item?.label ?? href;
  };
  /** Nombre accesible de una entrada: nombre completo y, si lo hay, el contador. */
  const navLabel = (href: string) => {
    const label = fullLabel(href);
    if (href === '/agenda' && waitingForYou > 0) return `${label} · ${waitingForYouLabel(waitingForYou)}`;
    if (inboxCount(href) > 0) {
      const count = inboxCount(href);
      // Preserve the visible label-and-count sequence for label-in-name checks.
      if (href === ANAMNESIS_HREF) return `Anamnesis ${count} · por revisar`;
      return `${label} ${count}`;
    }
    return label;
  };
  const hasCount = (href: string) => (href === '/agenda' && waitingForYou > 0) || inboxCount(href) > 0;
  // Activa la entrada MÁS específica que case: en /caja/cartera es «Cartera»,
  // no también «Caja».
  const activeHref = longestMatch(nav, pathname)?.href;

  // Raíl: en escritorio, la preferencia guardada; en tableta, raíl salvo que
  // se despliegue a mano (sin guardarlo: es una decisión del momento).
  const isTablet = useMediaQuery(TABLET_QUERY);
  const [collapsedPref, setCollapsedPref] = React.useState(false);
  const [tabletExpanded, setTabletExpanded] = React.useState(false);
  // Rehidratar la preferencia: localStorage no existe en SSR, así que no puede
  // ser el estado inicial sin romper la hidratación.
  React.useEffect(() => {
    function hydrate() {
      setCollapsedPref(getSidebarCollapsed());
    }
    hydrate();
  }, []);
  const collapsed = isTablet ? !tabletExpanded : collapsedPref;
  function toggleSidebar() {
    if (isTablet) {
      setTabletExpanded(!tabletExpanded);
      return;
    }
    const next = !collapsedPref;
    setCollapsedPref(next);
    setSidebarCollapsed(next);
  }

  // Paleta de comandos: ⌘K / Ctrl+K desde cualquier pantalla.
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const [moreOpen, setMoreOpen] = React.useState(false);
  const keyboardOpen = useVirtualKeyboardOpen();
  const { loggingOut, logout } = useLogout();
  // «Más» lleva lo que no está en la barra inferior; grupos vacíos fuera.
  const moreGroups: NavGroup[] = groups
    .map((g) => ({ ...g, items: g.items.filter((i) => !tabs.includes(i)) }))
    .filter((g) => g.items.length > 0);
  const activeInMore = activeHref !== undefined && !tabs.some((t) => t.href === activeHref);

  const countBadge = (href: string, variant: 'full' | 'rail' | 'inline') => (
    <>
      {inboxCount(href) > 0 && <InboxCount href={href} count={inboxCount(href)} variant={variant} />}
      {href === '/agenda' && waitingForYou > 0 && variant !== 'full' && (
        <WaitingForYouCount count={waitingForYou} variant={variant} />
      )}
    </>
  );

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
        {/* Cabecera: marca + control de colapso. En raíl no caben las dos
            cosas en 64px, así que la celda pasa a ser un único botón que
            muestra la marca y la cambia por el chevron al hover/focus. */}
        <div className={cn('flex h-16 shrink-0 items-center', collapsed ? 'justify-center px-2' : 'gap-2 pl-4 pr-3')}>
          {collapsed ? (
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label={copy.expand}
              title={copy.expand}
              className="group flex size-10 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span aria-hidden className="flex group-hover:hidden group-focus-visible:hidden">
                <BrandMark name={branding.name} logoUrl={branding.logoUrl} />
              </span>
              <PanelLeftOpen aria-hidden className="hidden size-5 group-hover:block group-focus-visible:block" />
            </button>
          ) : (
            <>
              <div className="min-w-0 flex-1">
                <ShellBrand name={branding.name} logoUrl={branding.logoUrl} />
              </div>
              <button
                type="button"
                onClick={toggleSidebar}
                aria-label={copy.collapse}
                title={copy.collapse}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <PanelLeftClose aria-hidden className="size-4" />
              </button>
            </>
          )}
        </div>
        {/* Disparador discreto de la paleta, con el atajo a la vista. */}
        <div className={cn('shrink-0 pb-2', collapsed ? 'flex justify-center px-2' : 'px-3')}>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            // Expandido, el nombre es el texto visible («Buscar…» y el atajo): label-in-name.
            aria-label={collapsed ? copy.search : undefined}
            aria-keyshortcuts="Meta+K Control+K"
            title={collapsed ? `${copy.search} (⌘K / Ctrl K)` : undefined}
            className={cn(
              'flex items-center rounded-md border border-border bg-surface text-sm text-muted transition-colors hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              collapsed ? 'size-10 justify-center' : 'h-9 w-full gap-2 px-2.5',
            )}
          >
            <Search aria-hidden className="size-4 shrink-0" />
            {!collapsed && (
              <>
                <span className="flex-1 text-left">{copy.searchLong}</span>
                <ShortcutHint />
              </>
            )}
          </button>
        </div>
        <nav
          aria-label={copy.sections}
          className={cn(
            // El menú largo cede altura y se desplaza dentro del sidebar;
            // la marca y la cuenta permanecen dentro de la ventana.
            'flex min-h-0 flex-1 flex-col overflow-y-auto scroll-py-2 pb-2',
            // 63 px interiores − 15 px de barra clásica − 4 px de padding = 44 px útiles;
            // con h-11, cada enlace del carril es un objetivo táctil de 44×44.
            collapsed ? 'px-0.5' : 'px-3',
          )}
        >
          {groups.map((group, index) => (
            // Densidad medida (DX-347): a 900 px de alto los 15 enlaces de ADMIN,
            // sus 4 grupos, la cabecera y el pie caben sin scroll. Expandido,
            // enlaces de 32 px; en el raíl, 15 × 44 px táctiles pegados y una
            // regla de 1 px entre grupos (con margen no cabían: 764 px de 675).
            <div
              key={group.id}
              role="group"
              aria-label={group.label ?? undefined}
              className={cn('flex flex-col', !collapsed && 'gap-0.5')}
            >
              {index > 0 &&
                (collapsed ? (
                  <hr aria-hidden className="mx-3 my-0 border-border-subtle" />
                ) : (
                  <p aria-hidden className="t-overline whitespace-nowrap px-3 pb-1 pt-4">
                    {group.label}
                  </p>
                ))}
              {group.items.map(({ href, label, fullLabel: long, icon: Icon }) => {
                const active = href === activeHref;
                const named = collapsed || hasCount(href) || !!long;
                return (
                  <div key={href} className={cn('relative flex items-center', !collapsed && 'gap-1')}>
                    <Link
                      href={href}
                      aria-current={active ? 'page' : undefined}
                      // En raíl el texto no está, así que el nombre accesible
                      // viene del aria-label; el title lo hace visible al hover.
                      aria-label={named ? navLabel(href) : undefined}
                      title={collapsed || long ? navLabel(href) : undefined}
                      className={cn(
                        'relative flex items-center whitespace-nowrap rounded-md text-sm font-medium transition-colors',
                        collapsed ? 'h-11 w-full justify-center' : 'min-h-8 min-w-0 flex-1 gap-3 px-3 py-1.5',
                        active
                          ? 'bg-primary-subtle text-primary-subtle-text'
                          : 'text-muted hover:bg-surface-sunken hover:text-ink',
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      {!collapsed && <span className="min-w-0 truncate">{label}</span>}
                      {!collapsed && inboxCount(href) > 0 ? ' ' : null}
                      {inboxCount(href) > 0 && (
                        <InboxCount href={href} count={inboxCount(href)} variant={collapsed ? 'rail' : 'full'} />
                      )}
                    </Link>
                    {href === '/agenda' && waitingForYou > 0 && (
                      <Link
                        href="/agenda/en-clinica"
                        aria-label={waitingForYouLabel(waitingForYou)}
                        className={cn(
                          'rounded-full focus-visible:outline-2 focus-visible:outline-primary',
                          collapsed && 'absolute right-0 -top-1',
                        )}
                      >
                        <WaitingForYouCount count={waitingForYou} variant={collapsed ? 'rail' : 'full'} />
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>
        {/* Pie del sidebar: contexto (sede) encima de identidad (cuenta). */}
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
        {/* Barra superior SOLO en el teléfono: marca de la clínica, sede,
            búsqueda y cuenta. El título de la pantalla es su propio H1 (no
            se repite aquí). */}
        <header className="flex shrink-0 items-center gap-1 border-b border-border bg-surface pl-4 pr-2 pt-[env(safe-area-inset-top)] md:hidden">
          <div className="flex h-14 min-w-0 flex-1 items-center">
            <ShellBrand name={branding.name} logoUrl={branding.logoUrl} />
          </div>
          {/* La sede, compacta (pin + rótulo corto, nombre entero en el nombre
              accesible): la marca de la clínica se queda el ancho y ya no se
              cortan las dos a 390 px. */}
          <LocationSwitcher variant="phone" />
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label={copy.search}
            className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Search aria-hidden className="size-5" />
          </button>
          <UserMenu variant="compact" />
        </header>

        {/* `min-h-0` deja que main se encoja por debajo de su contenido; lo que
            sobra scrollea aquí dentro, no en la página: la barra lateral, la
            superior y la inferior se quedan fijas.
            `relative` no es decorativo: sin él, un descendiente `absolute` sin
            ancestro posicionado toma como bloque contenedor el documento y lo
            estira (el `sr-only` de `Pagination`). */}
        <main className="relative flex min-h-0 flex-1 flex-col overflow-y-auto bg-canvas px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>

        {/* Barra inferior del teléfono. Va en el flujo del shell (última fila
            de la columna de 100dvh), no `position: fixed`: así nunca tapa el
            final de la página y no hace falta reservar su alto en cada
            pantalla. El inset inferior va en la caja exterior y el alto fijo
            (56 px) en la fila interior. Con el teclado abierto se oculta. */}
        <nav
          aria-label={copy.mainNav}
          data-testid="bottom-tab-bar"
          className={cn(
            'shrink-0 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden',
            keyboardOpen && 'hidden',
          )}
        >
          <ul className="grid h-14 grid-cols-5">
            {tabs.map(({ href, label, tabLabel, fullLabel: long, icon: Icon }) => {
              const active = href === activeHref;
              const text = tabLabel ?? label;
              return (
                <li key={href} className="flex">
                  <Link
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    aria-label={hasCount(href) || long ? navLabel(href) : undefined}
                    className={cn(
                      'relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-medium leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                      active ? 'text-primary-text' : 'text-muted hover:text-ink',
                    )}
                  >
                    <TabIndicator active={active} />
                    <span className="relative">
                      <Icon className="size-5" />
                      {hasCount(href) && (
                        <span className="absolute -right-3 -top-1.5">{countBadge(href, 'inline')}</span>
                      )}
                    </span>
                    <span className="max-w-full truncate px-0.5">{text}</span>
                  </Link>
                </li>
              );
            })}
            <li className="flex">
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={moreOpen}
                className={cn(
                  'relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-medium leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                  activeInMore ? 'text-primary-text' : 'text-muted hover:text-ink',
                )}
              >
                <TabIndicator active={activeInMore} />
                <Ellipsis aria-hidden className="size-5" />
                <span>{copy.more}</span>
              </button>
            </li>
          </ul>
        </nav>
      </div>

      <MoreSheet
        open={moreOpen}
        onOpenChange={setMoreOpen}
        groups={moreGroups}
        activeHref={activeHref}
        accessibleName={navLabel}
        count={(href) => (hasCount(href) ? countBadge(href, 'inline') : null)}
        onLogout={() => void logout()}
        loggingOut={loggingOut}
      />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} token={accessToken} role={role} />
    </div>
  );
}

/** Rayita sobre el icono activo de la barra inferior. */
function TabIndicator({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'absolute top-0 h-0.5 w-8 rounded-b-full bg-primary transition-opacity',
        active ? 'opacity-100' : 'opacity-0',
      )}
    />
  );
}

/**
 * Marca del shell: la de la CLÍNICA (logo, o iniciales + nombre) cuando el
 * tenant la tiene (white-label); si no, la de Dentalix.
 */
function ShellBrand({ name, logoUrl }: { name: string | null; logoUrl: string | null }) {
  if (name) return <ClinicBrand variant="shell" name={name} logoUrl={logoUrl} />;
  return <Logo size={28} withWordmark className="text-[0.9375rem]" />;
}

/** La marca en el raíl: cabe en 32 px. */
function BrandMark({ name, logoUrl }: { name: string | null; logoUrl: string | null }) {
  if (name && logoUrl) return <ClinicLogo src={logoUrl} alt="" variant="shell" className="size-8 object-contain" />;
  if (name) {
    const initials = name
      .split(/\s+/)
      .filter((w) => /\p{L}/u.test(w[0] ?? ''))
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('');
    return (
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary-subtle text-xs font-semibold text-primary-subtle-text">
        {initials || '·'}
      </span>
    );
  }
  return <Logo size={28} decorative />;
}

/**
 * DX-200: contador «Te esperan N» del odontólogo en la navegación. Tinte de
 * peligro (no relleno): avisa, no es una acción destructiva. En el raíl y en
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
        'inline-flex items-center justify-center rounded-full border border-danger/40 bg-danger-subtle text-xs font-semibold tabular-nums text-danger-text',
        variant === 'full' && 'ml-auto whitespace-nowrap px-2 py-0.5',
        variant === 'rail' && 'min-w-5 px-1',
        variant === 'inline' && 'min-w-5 px-1.5',
      )}
    >
      {variant === 'full' ? `Te esperan ${count}` : count}
    </span>
  );
}

/**
 * Contador de bandeja: «Anamnesis por revisar» (DX-099) y «Pendiente de
 * cerrar» (DX-439). Tinte de aviso (no de peligro): hay trabajo pendiente, no
 * una alerta. El número entero va en el nombre accesible del enlace.
 */
function InboxCount({ href, count, variant }: { href: string; count: number; variant: 'full' | 'rail' | 'inline' }) {
  return (
    <span
      aria-hidden
      data-testid={href === CLOSING_QUEUE_HREF ? 'closing-queue-count' : 'anamnesis-inbox-count'}
      className={cn(
        'inline-flex min-w-5 items-center justify-center rounded-full bg-warning-subtle px-1.5 text-xs font-semibold tabular-nums text-warning-text',
        variant === 'full' && 'ml-auto',
        variant === 'rail' && 'absolute right-0 -top-1',
      )}
    >
      {count}
    </span>
  );
}
