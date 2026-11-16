'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { PendingExternalOrdersView } from '@/components/external-orders/pending-external-orders-view';

// «Órdenes sin resultado» (DX-572), los cuatro roles. Sin entrada en la barra
// (presupuesto de 900 px, DESIGN.md → Navigation): se llega desde la paleta y
// desde la pestaña «Órdenes» de la ficha. Mismo guard de sesión que el resto.
export default function PendingExternalOrdersPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;
  return <PendingExternalOrdersView token={accessToken} />;
}
