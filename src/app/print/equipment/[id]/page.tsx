'use client';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { useSessionBootstrap } from '@/lib/auth/use-session-bootstrap';
import { EquipmentPrintView } from '@/components/equipment/equipment-print-view';

const copy = {
  checkingSession: 'Verificando sesión…',
};

/**
 * Vista imprimible de la hoja de vida de un equipo (DX-542). Fuera del grupo
 * `(app)` como la tarjeta de implante: sin raíl ni pestañas, solo el documento.
 */
export default function EquipmentPrintPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  // Pestaña nueva: la sesión se recupera de la cookie HttpOnly (DX-062).
  useSessionBootstrap();

  useEffect(() => {
    if (hasHydrated && !accessToken) router.replace('/login');
  }, [accessToken, hasHydrated, router]);

  if (!hasHydrated) {
    return (
      <p role="status" className="px-4 py-8 text-center text-sm text-muted">
        {copy.checkingSession}
      </p>
    );
  }
  if (!accessToken) return null;

  return <EquipmentPrintView token={accessToken} equipmentId={params.id} />;
}
