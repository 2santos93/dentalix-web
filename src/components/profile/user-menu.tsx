'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { ChevronUp, LogOut, Moon, Settings, UserRound } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useAuthStore } from '@/lib/auth/auth-store';
import { logout } from '@/lib/auth/auth-api';
import { getMe, type ClinicRole } from '@/lib/me/me-api';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

// Tope de espera a la revocación en el servidor al cerrar sesión: la API suele
// responder en milisegundos; si la red está caída no se deja al usuario
// mirando un botón muerto (DX-061).
const LOGOUT_TIMEOUT_MS = 3000;

/**
 * Revoca el refresh token de la cookie en la API (`POST /auth/logout`, que
 * además borra la cookie) best-effort: resuelve cuando la API responde, cuando
 * falla o al vencer el timeout — nunca lanza. El cierre local tiene que ocurrir
 * igual en todos los casos.
 */
async function revokeSession(): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, LOGOUT_TIMEOUT_MS);
  });
  try {
    await Promise.race([logout().catch(() => undefined), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

const copy = {
  account: 'Cuenta',
  profile: 'Mi perfil',
  // DX-282: los ajustes de la clínica viven en /settings, agrupados por tema.
  settings: 'Ajustes',
  darkTheme: 'Tema oscuro',
  logout: 'Cerrar sesión',
};

// Etiquetas de rol en español — espejo de las de profile-view.tsx.
const ROLE_LABEL: Record<ClinicRole, string> = {
  ADMIN: 'Administrador/a',
  DENTIST: 'Odontólogo/a',
  ASSISTANT: 'Asistente',
  RECEPTION: 'Recepción',
};

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
}

/**
 * Clases de los ítems del menú de cuenta. Bajo `md` llegan a 44 px de alto
 * (FE-068): en el móvil es un objetivo táctil.
 */
const ITEM = 'max-md:min-h-11';

/**
 * Tema oscuro como `menuitemcheckbox`: entra en el recorrido con flechas (un
 * `switch` suelto dentro de un `role="menu"` no lo alcanza el teclado) y
 * anuncia su estado. El interruptor de la derecha es solo la marca visual.
 * Cambiarlo no cierra el menú: se ve el efecto y se sigue.
 */
function ThemeItem() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // Marca el montaje en cliente para evitar el mismatch de hidratación de
  // next-themes; setState-en-effect intencional para este patrón SSR.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === 'dark';

  return (
    <DropdownMenuPrimitive.CheckboxItem
      checked={isDark}
      disabled={!mounted}
      onSelect={(event) => {
        event.preventDefault();
        setTheme(isDark ? 'light' : 'dark');
      }}
      className={cn(
        'flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink outline-none transition-colors',
        'data-[highlighted]:bg-surface-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        ITEM,
      )}
    >
      <Moon className="size-4 shrink-0 text-muted" aria-hidden />
      <span className="flex-1">{copy.darkTheme}</span>
      <span
        aria-hidden
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-border transition-colors',
          isDark ? 'bg-primary' : 'bg-bg',
        )}
      >
        <span
          className={cn(
            'inline-block h-5 w-5 rounded-full bg-surface shadow transition-transform',
            isDark ? 'translate-x-5' : 'translate-x-0.5',
          )}
        />
      </span>
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

/**
 * Menú de cuenta (DX-282, sobre Radix como pedía DX-065). Muestra avatar (foto
 * o iniciales), nombre y rol del usuario autenticado (`GET /me`) y despliega
 * «Mi perfil», «Ajustes», el tema y «Cerrar sesión».
 *
 * Los ajustes de la clínica ya no están aquí: con 21 entradas el menú se salía
 * por arriba de una pantalla de 1366×768 (FE-062). Ahora son cuatro ítems, y
 * aun así el panel lleva un tope de alto con scroll propio y Radix lo
 * recoloca si choca con el borde (`collisionPadding`), por si el menú crece.
 * Radix da además flechas, Escape, foco devuelto al disparador y clic fuera.
 * No modal (`modal={false}`): un menú de cuenta no tiene por qué bloquear el
 * scroll ni marcar `aria-hidden` el resto de la página, que sigue teniendo
 * elementos enfocables (axe `aria-hidden-focus`); Tab fuera lo cierra.
 *
 * - `variant="card"` (default): tarjeta a lo ancho para el pie del sidebar; el
 *   menú se abre hacia ARRIBA, a lo ancho de la tarjeta.
 * - `variant="rail"`: solo el avatar, para el sidebar colapsado; el menú abre
 *   hacia arriba y desborda el rail hacia el contenido.
 * - `variant="compact"`: solo el avatar (topbar en móvil); el menú abre abajo.
 */
export function UserMenu({
  variant = 'card',
}: {
  variant?: 'card' | 'compact' | 'rail';
}) {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [name, setName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [role, setRole] = useState<ClinicRole | null>(null);
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    getMe(accessToken)
      .then((p) => {
        if (!active) return;
        setName(p.fullName);
        setAvatarUrl(p.avatarUrl);
        setRole(p.memberships[0]?.role ?? null);
      })
      .catch(() => {
        /* silencioso: el menú simplemente no muestra datos */
      });
    return () => {
      active = false;
    };
  }, [accessToken]);

  if (!accessToken) return null;

  // Cerrar sesión revoca primero el refresh token en la API (DX-061, FE-003):
  // en un ordenador compartido de recepción, un refresh copiado antes del
  // logout no debe seguir sirviendo. Solo después se limpia el store y se
  // redirige, pase lo que pase con la llamada.
  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    // La cookie es HttpOnly: desde aquí no se sabe si existe, así que siempre
    // se pide el logout (sin cookie, la API responde 204 igual).
    await revokeSession();
    useAuthStore.getState().clear();
    router.push('/login');
  }

  const roleLabel = role ? (ROLE_LABEL[role] ?? role) : null;

  const avatar = (size: string) =>
    avatarUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={avatarUrl} alt="" className={cn('shrink-0 rounded-full object-cover', size)} />
    ) : (
      <span
        aria-hidden
        className={cn(
          // Iniciales en tinta, no en el acento: sobre su propio tinte (y más aún
          // con el tinte de la tarjeta abierta o en hover) el acento no llega a
          // 4,5:1 (axe, DX-282), y con el color de otra clínica, menos.
          'flex shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-ink',
          size,
        )}
      >
        {name ? initials(name) : '·'}
      </span>
    );

  const menu = (
    <DropdownMenuContent
      side={variant === 'compact' ? 'bottom' : 'top'}
      align={variant === 'compact' ? 'end' : 'start'}
      avoidCollisions
      collisionPadding={8}
      // Cuatro ítems: de «Mi perfil» a «Cerrar sesión» con una sola flecha.
      loop
      className={cn(
        // Red de seguridad (FE-062): nunca más alto que el hueco que deja Radix
        // ni que la ventana; si no cabe, scroll dentro del propio menú.
        'max-h-[min(var(--radix-dropdown-menu-content-available-height),calc(100dvh-1rem))] overflow-auto overscroll-contain',
        // En card, a lo ancho de la tarjeta; en rail el disparador mide 40px y
        // el menú lleva un ancho propio.
        variant === 'card' ? 'w-(--radix-dropdown-menu-trigger-width)' : 'w-56',
      )}
    >
      <DropdownMenuItem asChild className={ITEM}>
        <Link href="/settings/profile">
          <UserRound aria-hidden />
          {copy.profile}
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild className={ITEM}>
        <Link href="/settings">
          <Settings aria-hidden />
          {copy.settings}
        </Link>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <ThemeItem />
      <DropdownMenuSeparator />
      <DropdownMenuItem
        destructive
        disabled={loggingOut}
        aria-busy={loggingOut}
        onSelect={() => void handleLogout()}
        className={cn('font-medium', ITEM)}
      >
        <LogOut aria-hidden />
        {copy.logout}
      </DropdownMenuItem>
    </DropdownMenuContent>
  );

  if (variant === 'compact' || variant === 'rail') {
    const isRail = variant === 'rail';
    return (
      <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            // En rail el avatar es lo único que se ve: el nombre pasa al title
            // para que el hover lo revele, igual que los ítems de la nav.
            aria-label={isRail ? (name ?? copy.account) : copy.account}
            title={isRail ? (name ?? copy.account) : undefined}
            className={cn(
              'flex items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              isRail ? 'size-10 justify-center' : 'size-11 justify-center',
            )}
          >
            {avatar(isRail ? 'size-9' : 'size-8')}
          </button>
        </DropdownMenuTrigger>
        {menu}
      </DropdownMenu>
    );
  }

  // variant === 'card' — pie del sidebar
  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            open ? 'border-primary bg-primary/5' : 'border-border hover:bg-bg',
          )}
        >
          {avatar('size-9')}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-ink">
              {name ?? copy.account}
            </span>
            {roleLabel && <span className="block truncate text-xs text-primary">{roleLabel}</span>}
          </span>
          <ChevronUp
            aria-hidden
            className={cn('size-4 shrink-0 text-muted transition-transform', open ? '' : 'rotate-180')}
          />
        </button>
      </DropdownMenuTrigger>
      {menu}
    </DropdownMenu>
  );
}
