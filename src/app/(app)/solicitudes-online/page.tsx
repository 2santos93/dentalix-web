'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { OnlineRequestsView } from '@/components/online-booking/online-requests-view';

// «Solicitudes online» (DX-016), roles de la agenda. Sin entrada en la barra
// (presupuesto de 900 px, DESIGN.md → Navigation): se llega desde Pendientes
// de Inicio y desde la paleta ⌘K. Mismo guard de sesión que el resto.
export default function OnlineRequestsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;
  return <OnlineRequestsView token={accessToken} />;
}
