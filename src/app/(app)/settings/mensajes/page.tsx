'use client';
import { Lock } from 'lucide-react';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageMessageTemplates } from '@/lib/message-templates/message-templates-api';
import { EmptyState } from '@/components/shared/empty-state';
import { SettingsPage } from '@/components/settings/settings-page';
import { MessageTemplatesSettings } from '@/components/message-templates/message-templates-settings';

const copy = {
  title: 'Mensajes',
  description:
    'Los textos de los emails y WhatsApp que reciben los pacientes, en cada idioma. Sin cambios, sale el texto por defecto.',
  forbiddenTitle: 'Solo administración cambia los textos de los mensajes.',
  forbiddenHint: 'Pide a un administrador de la clínica que lo cambie si lo necesitas.',
};


/**
 * Ajustes › Mensajes (DX-565): los textos editables de los mensajes al
 * paciente. Solo ADMIN: sin permiso, un único aviso y sin pedir nada a la API.
 */
export default function MessageTemplatesPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  if (!accessToken) return null;
  const allowed = canManageMessageTemplates(getTokenRole(accessToken));
  return (
    <SettingsPage title={copy.title} description={copy.description} scope="clinic">
      {allowed ? (
        <MessageTemplatesSettings token={accessToken} />
      ) : (
        <EmptyState role="status" icon={<Lock aria-hidden />} title={copy.forbiddenTitle} description={copy.forbiddenHint} />
      )}
    </SettingsPage>
  );
}
