'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManagePlanTemplates } from '@/lib/treatment-plans/plan-templates-api';
import { SettingsPage } from '@/components/settings/settings-page';
import { PlanTemplatesManager } from '@/components/treatment-plans/plan-templates-manager';

const copy = {
  title: 'Plantillas de plan',
  description:
    'Procedimientos de un caso habitual, por visitas, para añadirlos al plan en segundos. Los precios salen de la lista vigente del paciente.',
};

/** Gestión de plantillas de plan de tratamiento (DX-559). Solo ADMIN. */
export default function PlanTemplatesPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;

  return (
    <SettingsPage title={copy.title} description={copy.description} scope="clinic">
      <PlanTemplatesManager
        token={accessToken}
        allowed={canManagePlanTemplates(getTokenRole(accessToken))}
      />
    </SettingsPage>
  );
}
