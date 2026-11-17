'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { CommissionsView } from '@/components/commissions/commissions-view';

// «Honorarios» (DX-018): ADMIN y DENTIST (lo suyo). Sin entrada en la barra
// (presupuesto de 900 px): paleta ⌘K, Reportes y Ajustes › Honorarios.
export default function CommissionsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;
  return <CommissionsView token={accessToken} />;
}
