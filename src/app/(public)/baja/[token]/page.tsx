import type { Metadata } from 'next';
import { PublicReminderOptOutView } from '@/components/reminders/public-reminder-opt-out-view';

// Página PÚBLICA para el paciente (DX-128): darse de baja de los recordatorios
// desde el enlace del email. Fuera de `(app)`: sin sesión ni shell. La clínica
// sale del host (el cliente HTTP manda `X-Tenant-Host`).
export const metadata: Metadata = {
  title: 'Recordatorios de tus citas',
  // El token viaja en la URL: que no se indexe ni salga en el Referer.
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

// `params` es una Promise en esta versión de Next (ver AGENTS.md /
// node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md).
export default async function ReminderOptOutPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PublicReminderOptOutView optOutToken={token} />;
}
