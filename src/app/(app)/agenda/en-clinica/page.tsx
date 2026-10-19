'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { useAuthStore } from '@/lib/auth/auth-store';
import { InClinicView } from '@/components/appointments/in-clinic-view';

const copy = {
  checkingSession: 'Verificando sesión…',
  back: 'Agenda',
};

/**
 * DX-200: el panel «En clínica» a pantalla completa (p. ej. en la tablet del
 * mostrador o desde el contador «Te esperan» del odontólogo).
 */
export default function InClinicPage() {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!accessToken) router.replace('/login');
  }, [accessToken, router, hasHydrated]);

  if (!hasHydrated) {
    return (
      <p role="status" className="text-sm text-muted">
        {copy.checkingSession}
      </p>
    );
  }
  if (!accessToken) return null;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/agenda"
        className="inline-flex h-11 items-center gap-1 self-start rounded-md text-sm font-medium text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:h-9"
      >
        <ChevronLeft aria-hidden className="size-4" />
        {copy.back}
      </Link>
      <InClinicView token={accessToken} />
    </div>
  );
}
