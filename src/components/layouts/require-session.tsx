'use client';
import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';

export const requireSessionCopy = {
  checkingSession: 'Verificando sesión…',
};

/**
 * Rutas de `(app)` que se abren SIN sesión (FE-020, DX-117). Hoy solo la
 * ayuda estática (DX-484: «Software de imagen», sin datos del paciente), que
 * nunca tuvo guarda: se conserva tal cual. Añadir una ruta aquí es una
 * decisión de producto, no un atajo.
 */
export const SESSIONLESS_PREFIXES = ['/ayuda'] as const;

export function isSessionless(pathname: string | null): boolean {
  if (!pathname) return false;
  return SESSIONLESS_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * La ÚNICA guarda de sesión de las pantallas de la app (FE-020, DX-117). Antes
 * cada página de `src/app/(app)` llevaba su copia (esperar al arranque, mandar
 * a /login, pintar «Verificando sesión…»); ahora va una vez en el layout,
 * dentro del `AppShell`, así que la barra lateral y la superior no cambian
 * mientras se verifica: solo el contenido es el esqueleto.
 *
 * - Hasta que el arranque de sesión termina (`_hasHydrated`, lo resuelve
 *   `useSessionBootstrap` en el shell) no se decide nada: el token es `null`
 *   hasta entonces y mandar a /login echaría a un usuario con sesión.
 * - Resuelto sin token → `router.replace('/login')`, sin parámetro de vuelta:
 *   el login lleva siempre a /patients y ninguna copia pasaba `next`.
 * - Es reactiva al store, no a la navegación: si el token se pierde a mitad de
 *   uso (refresh caducado, logout en esta pestaña o en otra —
 *   `onLogoutElsewhere` limpia el store—) la pantalla se desmonta y se va a
 *   /login, sin esperar a cambiar de ruta.
 * - Las páginas conservan sus avisos por rol (403, `RouteRoleGate`): esto solo
 *   mira si HAY sesión. Y es experiencia, no seguridad: quien autoriza es la API.
 *
 * Las páginas siguen leyendo el token del store; su `if (!accessToken) return
 * null` queda solo para el tipo (aquí dentro nunca es `null`).
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const open = isSessionless(pathname);

  useEffect(() => {
    if (open || !hasHydrated || accessToken) return;
    router.replace('/login');
  }, [open, hasHydrated, accessToken, router]);

  if (open || (hasHydrated && accessToken)) return <>{children}</>;
  // Verificando, o ya camino de /login: el mismo esqueleto (sin parpadeo).
  return <SessionSkeleton />;
}

/**
 * «Verificando sesión…» con la geometría de una pantalla de la app: cabecera
 * (título y una línea) y un bloque de contenido, dentro del `main` del shell.
 * El texto es el estado (lo anuncia el lector de pantalla); los bloques, solo
 * forma.
 */
function SessionSkeleton() {
  return (
    <div data-testid="session-skeleton" className="flex flex-col gap-6">
      <div aria-hidden className="flex flex-col gap-2">
        <span className="block h-8 w-56 max-w-full animate-pulse rounded bg-surface-sunken" />
        <span className="block h-4 w-96 max-w-full animate-pulse rounded bg-surface-sunken" />
      </div>
      <p role="status" className="text-sm text-muted">
        {requireSessionCopy.checkingSession}
      </p>
      <span aria-hidden className="block h-48 w-full animate-pulse rounded-xl bg-surface-sunken" />
    </div>
  );
}
