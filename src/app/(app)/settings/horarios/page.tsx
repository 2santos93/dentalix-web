'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { PageHeader } from '@/components/molecules/page-header';
import { BusinessHoursForm } from '@/components/locations/business-hours-form';

const copy = {
  title: 'Horario de atención',
  description:
    'Define los días y tramos en que la sede atiende. Las citas fuera de ese horario se rechazan.',
  checkingSession: 'Verificando sesión…',
};

/**
 * Configura el horario de la sede ACTIVA (el selector de sede del shell decide
 * cuál). Escribir requiere ADMIN: el backend lo exige, así que un rol sin permiso
 * verá el 403 en el mensaje de error al guardar — mismo criterio que la pantalla
 * de catálogo, que tampoco esconde el botón.
 */
export default function BusinessHoursPage() {
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
    <>
      <PageHeader title={copy.title} description={copy.description} />
      <BusinessHoursForm token={accessToken} />
    </>
  );
}
