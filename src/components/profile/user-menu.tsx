'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronUp, LogOut, Settings, Sun, Moon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getMe, type ClinicRole } from '@/lib/me/me-api';
import { cn } from '@/lib/utils';

const copy = {
  account: 'Cuenta',
  profile: 'Mi perfil',
  logout: 'Cerrar sesión',
  theme: 'Cambiar tema',
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

/** Fila de cambio de tema (sol · switch · luna) dentro del dropdown. */
function ThemeRow() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // Marca el montaje en cliente para evitar el mismatch de hidratación de
  // next-themes; setState-en-effect intencional para este patrón SSR.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === 'dark';

  return (
    <div className="flex items-center justify-between px-3 py-2">
      <Sun className="size-4 text-muted" aria-hidden />
      {mounted ? (
        <button
          type="button"
          role="switch"
          aria-checked={isDark}
          aria-label={copy.theme}
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          className={cn(
            'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            isDark ? 'bg-primary' : 'bg-bg',
          )}
        >
          <span
            className={cn(
              'inline-block h-5 w-5 rounded-full bg-surface shadow transition-transform',
              isDark ? 'translate-x-5' : 'translate-x-0.5',
            )}
          />
        </button>
      ) : (
        // Placeholder inerte del mismo tamaño: evita el layout shift en SSR.
        <span
          aria-hidden
          className="inline-flex h-6 w-11 shrink-0 rounded-full border border-border bg-bg"
        />
      )}
      <Moon className="size-4 text-muted" aria-hidden />
    </div>
  );
}

/**
 * Menú de cuenta. Muestra avatar (foto o iniciales), nombre y rol del usuario
 * autenticado (`GET /me`) y despliega un menú con acceso al perfil, cambio de
 * tema y cierre de sesión. Se cierra con clic-fuera o Escape.
 *
 * - `variant="card"` (default): tarjeta a lo ancho para el pie del sidebar; el
 *   menú se abre hacia ARRIBA, sobre la tarjeta.
 * - `variant="compact"`: solo el avatar (topbar en móvil); el menú abre abajo.
 */
export function UserMenu({ variant = 'card' }: { variant?: 'card' | 'compact' }) {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [name, setName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [role, setRole] = useState<ClinicRole | null>(null);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

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

  // Cerrar con clic-fuera y Escape.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!accessToken) return null;

  function handleLogout() {
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
          'flex shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary',
          size,
        )}
      >
        {name ? initials(name) : '·'}
      </span>
    );

  const menu = (
    <div
      role="menu"
      className={cn(
        'absolute z-20 rounded-xl border border-border bg-surface py-1 shadow-lg',
        variant === 'card' ? 'bottom-full left-0 right-0 mb-2' : 'right-0 top-full mt-2 w-56',
      )}
    >
      <Link
        href="/settings/profile"
        role="menuitem"
        onClick={() => setOpen(false)}
        className="flex items-center gap-3 px-3 py-2 text-sm text-ink hover:bg-bg"
      >
        <Settings className="size-4 text-muted" aria-hidden />
        {copy.profile}
      </Link>
      <div className="my-1 border-t border-border" />
      <ThemeRow />
      <div className="my-1 border-t border-border" />
      <button
        type="button"
        role="menuitem"
        onClick={handleLogout}
        className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm font-medium text-danger hover:bg-bg"
      >
        <LogOut className="size-4" aria-hidden />
        {copy.logout}
      </button>
    </div>
  );

  if (variant === 'compact') {
    return (
      <div className="relative" ref={wrapRef}>
        <button
          type="button"
          aria-label={copy.account}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {avatar('size-8')}
        </button>
        {open && menu}
      </div>
    );
  }

  // variant === 'card' — pie del sidebar
  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
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
      {open && menu}
    </div>
  );
}
