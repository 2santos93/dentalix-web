'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { InClinicView } from '@/components/appointments/in-clinic-view';

const copy = {
  checkingSession: 'Verificando sesión…',
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

  return <InClinicView token={accessToken} />;
}
