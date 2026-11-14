'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { AgendaView } from '@/components/appointments/agenda-view';
import { PageHeader } from '@/components/shared/page-header';
import { ClosingQueueLink } from '@/components/appointments/closing-queue-link';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  title: 'Agenda',
  description: 'Programa y gestiona las citas de tu clínica.',
};

export default function AgendaPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) {
    return null;
  }

  return (
    <>
      <PageHeader
        title={copy.title}
        description={copy.description}
        meta={<ClosingQueueLink token={accessToken} />}
      />
      <AgendaView token={accessToken} />
    </>
  );
}
