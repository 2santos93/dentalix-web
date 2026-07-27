'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getMe } from '@/lib/me/me-api';

const copy = {
  account: 'Cuenta',
  profile: 'Mi perfil',
  logout: 'Cerrar sesión',
};

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
}

export function UserMenu() {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [name, setName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    getMe(accessToken)
      .then((p) => {
        if (!active) return;
        setName(p.fullName);
        setAvatarUrl(p.avatarUrl);
      })
      .catch(() => {
        /* silencioso: el menú simplemente no muestra datos */
      });
    return () => {
      active = false;
    };
  }, [accessToken]);

  if (!accessToken) return null;

  function handleLogout() {
    useAuthStore.getState().clear();
    router.push('/login');
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={copy.account}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-ink hover:bg-bg"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="size-7 rounded-full object-cover" />
        ) : (
          <span aria-hidden className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {name ? initials(name) : '·'}
          </span>
        )}
        <span>{name ?? copy.account}</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-10 mt-1 w-44 rounded-lg border border-border bg-surface py-1 shadow-lg">
          <Link
            href="/settings/profile"
            role="menuitem"
            className="block px-3 py-2 text-sm text-ink hover:bg-bg"
            onClick={() => setOpen(false)}
          >
            {copy.profile}
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-bg"
          >
            {copy.logout}
          </button>
        </div>
      )}
    </div>
  );
}
