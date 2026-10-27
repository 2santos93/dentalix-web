'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManagePrescriptionTemplates } from '@/lib/prescriptions/prescriptions-api';
import { PageHeader } from '@/components/shared/page-header';
import { SETTINGS_BACK } from '@/components/settings/settings-sections';
import { PrescriptionTemplatesManager } from '@/components/prescriptions/prescription-templates-manager';

const copy = {
  title: 'Recetas',
  description: 'Plantillas para emitir más rápido.',
  countryNote: 'El país de cada sede, que decide los campos legales de la receta, se configura en',
  countryLink: 'Ajustes → Sedes',
  checkingSession: 'Verificando sesión…',
};

/**
 * Ajustes de recetas (DX-013): plantillas. El país de cada sede se edita en el
 * modal de sede (G1, spec §6.4). Solo ADMIN.
 */
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
        {allowed ? (
          <p className="max-w-[68ch] text-sm text-muted">
            {copy.countryNote}{' '}
            <Link href="/settings/sedes" className="whitespace-nowrap font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              {copy.countryLink}
            </Link>
            .
          </p>
        ) : null}
      </div>
    </>
  );
}
