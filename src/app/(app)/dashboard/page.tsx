'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { DashboardView } from '@/components/dashboard/dashboard-view';

/**
 * «Inicio» (I1): la pantalla de arranque de los cuatro roles. La cabecera
 * (título, línea de apoyo por rol y marca de alcance) la pinta la vista, que es
 * quien sabe el rol, la sede y su zona.
 */
export default function DashboardPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) {
    return null;
  }

  return <DashboardView token={accessToken} />;
}
