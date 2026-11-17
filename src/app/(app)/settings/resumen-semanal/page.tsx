'use client';
import { Lock } from 'lucide-react';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageWeeklyDigest } from '@/lib/clinic/weekly-digest-api';
import { EmptyState } from '@/components/shared/empty-state';
import { SettingsPage, SettingsSection } from '@/components/settings/settings-page';
import { WeeklyDigestSettingsForm } from '@/components/weekly-digest/weekly-digest-settings-form';
import { WeeklyDigestTestSend } from '@/components/weekly-digest/weekly-digest-test-send';

const copy = {
  title: 'Resumen semanal',
  description: 'Un email cada semana con las cifras de cada sede frente a la semana anterior, para los administradores que elijas.',
  sendingTitle: 'Envío',
  sendingDescription: 'Cuándo sale y quién lo recibe. Sin datos de pacientes: solo recuentos e importes.',
  testTitle: 'Prueba',
  testDescription:
    'Te enviamos ahora a tu correo el resumen de la semana pasada, para ver cómo llega. No cuenta como el envío semanal.',
  forbiddenTitle: 'Solo administración gestiona el resumen semanal.',
  forbiddenHint: 'Pide a un administrador de la clínica que te añada como destinatario si lo necesitas.',
};

/**
 * Ajustes › Resumen semanal (DX-568): el email semanal para el dueño. Solo
 * ADMIN: sin permiso, un único aviso de página y sin pedir nada a la API.
 */
export default function WeeklyDigestSettingsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;

  const allowed = canManageWeeklyDigest(getTokenRole(accessToken));
  return (
    <SettingsPage title={copy.title} description={copy.description} scope="clinic">
      {allowed ? (
        <>
          <SettingsSection title={copy.sendingTitle} description={copy.sendingDescription}>
            <WeeklyDigestSettingsForm token={accessToken} />
          </SettingsSection>
          <SettingsSection title={copy.testTitle} description={copy.testDescription}>
            <WeeklyDigestTestSend token={accessToken} />
          </SettingsSection>
        </>
      ) : (
        <EmptyState role="status" icon={<Lock aria-hidden />} title={copy.forbiddenTitle} description={copy.forbiddenHint} />
      )}
    </SettingsPage>
  );
}
