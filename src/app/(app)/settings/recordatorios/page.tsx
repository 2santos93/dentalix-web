'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageReminders } from '@/lib/reminders/reminders-api';
import { SettingsPage } from '@/components/settings/settings-page';
import { ReminderSettingsManager } from '@/components/reminders/reminder-settings-manager';

const copy = {
  title: 'Recordatorios',
  description:
    'Correos automáticos antes de cada cita, con un enlace para que el paciente confirme o cancele.',
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
    <SettingsPage title={copy.title} description={copy.description} scope="sede">
      <ReminderSettingsManager
        token={accessToken}
        allowed={canManageReminders(getTokenRole(accessToken))}
      />
    </SettingsPage>
  );
}
