'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { PatientsView } from '@/components/patients/patients-view';

// El título y la descripción NO están aquí: los pinta `PatientsView` dentro de
// su `PageHeader`. La página solo resuelve la sesión, igual que las de
// inventario, catálogo y personal.
export default function PatientsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) {
    return null;
  }

  return <PatientsView token={accessToken} />;
}
