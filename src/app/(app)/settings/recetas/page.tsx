'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManagePrescriptionTemplates } from '@/lib/prescriptions/prescriptions-api';
import { PageHeader } from '@/components/shared/page-header';
import { SETTINGS_BACK } from '@/components/settings/settings-sections';
import { PrescriptionTemplatesManager } from '@/components/prescriptions/prescription-templates-manager';
import { LocationCountrySettings } from '@/components/prescriptions/location-country-settings';

const copy = {
  title: 'Recetas',
  description:
    'Plantillas para emitir más rápido y el país de cada sede, que decide los campos legales de la receta.',
  checkingSession: 'Verificando sesión…',
};

/** Ajustes de recetas (DX-013): plantillas y país por sede. Solo ADMIN. */
export default function PrescriptionSettingsPage() {
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

  const allowed = canManagePrescriptionTemplates(getTokenRole(accessToken));
  return (
    <>
      <PageHeader back={SETTINGS_BACK} title={copy.title} description={copy.description} />
      <div className="flex flex-col gap-10">
        <PrescriptionTemplatesManager token={accessToken} allowed={allowed} />
        {allowed ? <LocationCountrySettings token={accessToken} /> : null}
      </div>
    </>
  );
}
