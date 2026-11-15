'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { AgendaView } from '@/components/appointments/agenda-view';
import { OfflineAgendaView } from '@/components/appointments/offline-agenda';
import { useOfflineAgendaSync } from '@/components/appointments/use-offline-agenda-sync';
import { OfflineCopyControl } from '@/components/appointments/offline-copy';
import { PageHeader } from '@/components/shared/page-header';
import { ClosingQueueLink } from '@/components/appointments/closing-queue-link';
import { useOffline } from '@/lib/offline/connectivity';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  title: 'Agenda',
  description: 'Programa y gestiona las citas de tu clínica.',
};

export default function AgendaPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  // DX-405: sin conexión, la copia cifrada de hoy y mañana (solo lectura);
  // con conexión, la agenda de siempre, que guarda esa copia de fondo. Al
  // volver la red la agenda se monta de nuevo y relee todo.
  const offline = useOffline();
  useOfflineAgendaSync(accessToken, !offline);

  if (offline) {
    return (
      <>
        <PageHeader title={copy.title} description={copy.description} />
        <OfflineAgendaView token={accessToken} />
      </>
    );
  }

  if (!accessToken) {
    return null;
  }

  return (
    <>
      <PageHeader
        title={copy.title}
        description={copy.description}
        meta={<ClosingQueueLink token={accessToken} />}
        // DX-405: activar (con PIN), desbloquear o quitar la copia sin conexión.
        actions={<OfflineCopyControl token={accessToken} />}
      />
      <AgendaView token={accessToken} />
    </>
  );
}
