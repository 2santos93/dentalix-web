'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { AnamnesisInboxView } from '@/components/anamnesis/anamnesis-inbox-view';

// «Anamnesis por revisar» (DX-099). Mismo guard de sesión que el resto: un
// rol sin acceso que llegue por URL ve el aviso de la vista (la API da 403).
const copy = { checkingSession: 'Verificando sesión…' };

export default function AnamnesisInboxPage() {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (hasHydrated && !accessToken) router.replace('/login');
  }, [accessToken, router, hasHydrated]);

  if (!hasHydrated) {
    return (
      <p role="status" className="text-sm text-muted">
        {copy.checkingSession}
      </p>
    );
  }
  if (!accessToken) return null;
  return <AnamnesisInboxView token={accessToken} />;
}
