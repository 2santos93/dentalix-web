import type { Metadata } from 'next';
import { PublicSlotOfferView } from '@/components/appointments/public-slot-offer-view';

// Página PÚBLICA para el paciente (DX-435), fuera de `(app)`: sin sesión ni
// shell. La clínica sale del host (el cliente HTTP manda `X-Tenant-Host`).
export const metadata: Metadata = {
  title: 'Un hueco libre para ti',
  // El token viaja en la URL: que no se indexe ni salga en el Referer.
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

// `params` es una Promise en esta versión de Next (ver AGENTS.md /
// node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md).
export default async function SlotOfferPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicSlotOfferView token={token} />;
}
