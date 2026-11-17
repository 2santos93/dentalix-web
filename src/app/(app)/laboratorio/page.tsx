'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { LabOrdersView } from '@/components/lab-orders/lab-orders-view';

// «Trabajos de laboratorio» (DX-017), los cuatro roles. Mismo guard de sesión
// que el resto de pantallas del grupo (app).
export default function LabOrdersPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;
  return <LabOrdersView token={accessToken} />;
}
