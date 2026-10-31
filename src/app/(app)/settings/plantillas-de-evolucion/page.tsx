'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageNoteTemplates } from '@/lib/clinical-notes/note-templates-api';
import { SettingsPage } from '@/components/settings/settings-page';
import { NoteTemplatesManager } from '@/components/clinical-notes/note-templates-manager';

const copy = {
  title: 'Plantillas de evolución',
  description:
    'Texto fijo con preguntas para documentar más rápido cada procedimiento. Editarlas o desactivarlas no cambia las evoluciones ya guardadas.',
  checkingSession: 'Verificando sesión…',
};

/** Gestión de plantillas de evolución (DX-170). Solo ADMIN. */
export default function NoteTemplatesPage() {
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
    <SettingsPage title={copy.title} description={copy.description} scope="clinic">
      <NoteTemplatesManager
        token={accessToken}
        allowed={canManageNoteTemplates(getTokenRole(accessToken))}
      />
    </SettingsPage>
  );
}
