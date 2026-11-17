import type { Metadata } from 'next';
import { PublicWeeklyDigestUnsubscribeView } from '@/components/weekly-digest/public-weekly-digest-unsubscribe-view';

// Página PÚBLICA (DX-568): dejar de recibir el resumen semanal desde el enlace
// del email. Fuera de `(app)`: sin sesión ni shell. La clínica sale del host
// (el cliente HTTP manda `X-Tenant-Host`).
export const metadata: Metadata = {
  title: 'Resumen semanal',
  // El token viaja en la URL: que no se indexe ni salga en el Referer.
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

// `params` es una Promise en esta versión de Next (ver AGENTS.md /
// node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md).
export default async function WeeklyDigestUnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PublicWeeklyDigestUnsubscribeView unsubscribeToken={token} />;
}
