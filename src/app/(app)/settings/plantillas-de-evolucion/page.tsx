'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageNoteTemplates } from '@/lib/clinical-notes/note-templates-api';
import { SettingsPage } from '@/components/settings/settings-page';
import { NoteTemplatesManager } from '@/components/clinical-notes/note-templates-manager';

const copy = {
  title: 'Plantillas de evolución',
  description:
    'Texto fijo con preguntas para documentar más rápido cada procedimiento. Editarlas o desactivarlas no cambia las evoluciones ya guardadas.',
};

/** Gestión de plantillas de evolución (DX-170). Solo ADMIN. */
export default function NoteTemplatesPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

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
