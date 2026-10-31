'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageReminders } from '@/lib/reminders/reminders-api';
import { PageHeader } from '@/components/shared/page-header';
import { SETTINGS_BACK } from '@/components/settings/settings-sections';
import { ReminderSettingsManager } from '@/components/reminders/reminder-settings-manager';

const copy = {
  title: 'Recordatorios',
  description:
    'Emails automáticos antes de cada cita, por sede, con un enlace para que el paciente confirme o cancele.',
  checkingSession: 'Verificando sesión…',
};

/** Recordatorio automático de cita por email, por sede (DX-026). Solo ADMIN. */
export default function RemindersSettingsPage() {
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
      <PageHeader back={SETTINGS_BACK} title={copy.title} description={copy.description} />
      {/* Plantilla de Ajustes: columna de 720 px alineada a la izquierda. */}
      <div className="w-full max-w-[45rem]">
        <ReminderSettingsManager
          token={accessToken}
          allowed={canManageReminders(getTokenRole(accessToken))}
        />
      </div>
    </>
  );
}
