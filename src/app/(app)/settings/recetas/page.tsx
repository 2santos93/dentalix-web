'use client';
import { useEffect, useId } from 'react';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManagePrescriptionSettings } from '@/lib/prescriptions/prescriptions-api';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { SectionHeader } from '@/components/ui/section-header';
import { SETTINGS_BACK } from '@/components/settings/settings-sections';
import { PrescriptionSettingsForm } from '@/components/prescriptions/prescription-settings-form';
import { PrescriptionTemplatesManager } from '@/components/prescriptions/prescription-templates-manager';

const copy = {
  title: 'Recetas',
  description: 'Plantillas y datos que imprime la receta.',
  settingsTitle: 'Datos de la receta',
  settingsDescription:
    'Se aplican a las recetas que se emitan desde ahora, en todas las sedes. Las ya emitidas no cambian.',
  forbiddenTitle: 'Solo administración cambia los datos de la receta.',
  forbiddenHint: 'Las recetas se emiten con los ajustes que fije administración.',
  checkingSession: 'Verificando sesión…',
};

/**
 * Ajustes de recetas (DX-013, DX-324): los datos que imprime la receta y las
 * plantillas. Solo ADMIN: sin permiso, un único aviso de página, sin montar
 * el formulario ni las plantillas (que traen su propio candado).
 */
export default function PrescriptionSettingsPage() {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const settingsHeadingId = useId();

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

  const allowed = canManagePrescriptionSettings(getTokenRole(accessToken));
  return (
    <>
      <PageHeader back={SETTINGS_BACK} title={copy.title} description={copy.description} />
      {allowed ? (
        <div className="flex flex-col gap-10">
          {/* Las dos mitades comparten la columna de 720px de Ajustes. */}
          <section aria-labelledby={settingsHeadingId} className="flex max-w-[720px] flex-col gap-4">
            <SectionHeader
              titleId={settingsHeadingId}
              title={copy.settingsTitle}
              description={copy.settingsDescription}
            />
            <PrescriptionSettingsForm token={accessToken} />
          </section>
          <PrescriptionTemplatesManager token={accessToken} allowed />
        </div>
      ) : (
        <EmptyState role="status" icon={<Lock aria-hidden />} title={copy.forbiddenTitle} description={copy.forbiddenHint} />
      )}
    </>
  );
}
