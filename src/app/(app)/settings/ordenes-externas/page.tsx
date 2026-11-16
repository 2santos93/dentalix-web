'use client';
import { Lock } from 'lucide-react';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageExternalOrderSettings } from '@/lib/external-orders/external-orders-api';
import { EmptyState } from '@/components/shared/empty-state';
import { SettingsPage, SettingsSection } from '@/components/settings/settings-page';
import { ExternalOrderSettingsForm } from '@/components/external-orders/external-order-settings-form';
import { ExternalOrderTemplatesManager } from '@/components/external-orders/external-order-templates-manager';

const copy = {
  title: 'Órdenes externas',
  description: 'Plantillas de las órdenes de estudios y referencias, y el plazo para darlas por vencidas.',
  templatesTitle: 'Plantillas',
  templatesDescription: 'Tipo, destinatario habitual y estudios que se precargan al emitir una orden.',
  overdueTitle: 'Plazo del resultado',
  overdueDescription: 'Cuándo una orden sin resultado sale «Vencida» en «Órdenes sin resultado».',
  forbiddenTitle: 'Solo administración gestiona las órdenes externas.',
  forbiddenHint: 'El equipo clínico usa las plantillas al emitir una orden desde la ficha del paciente.',
};

/**
 * Ajustes › Órdenes externas (DX-572): plantillas y plazo de vencimiento. Solo
 * ADMIN: sin permiso, un único aviso de página y sin pedir nada a la API.
 */
export default function ExternalOrdersSettingsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;

  const allowed = canManageExternalOrderSettings(getTokenRole(accessToken));
  return (
    <SettingsPage title={copy.title} description={copy.description} scope="clinic">
      {allowed ? (
        <>
          <SettingsSection title={copy.templatesTitle} description={copy.templatesDescription}>
            <ExternalOrderTemplatesManager token={accessToken} />
          </SettingsSection>
          <SettingsSection title={copy.overdueTitle} description={copy.overdueDescription}>
            <ExternalOrderSettingsForm token={accessToken} />
          </SettingsSection>
        </>
      ) : (
        <EmptyState role="status" icon={<Lock aria-hidden />} title={copy.forbiddenTitle} description={copy.forbiddenHint} />
      )}
    </SettingsPage>
  );
}
