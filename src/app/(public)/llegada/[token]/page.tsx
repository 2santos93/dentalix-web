import type { Metadata } from 'next';
import { PublicCheckInView } from '@/components/appointments/public-check-in-view';

// Página PÚBLICA del QR de llegada de una sede (DX-265), fuera de `(app)`: sin
// sesión ni shell. La clínica sale del host (el cliente HTTP manda
// `X-Tenant-Host`). `proxy.ts` pone `no-referrer`, `no-store` y `noindex`: el
// token va en la URL y la página pide documento y fecha de nacimiento.
export const metadata: Metadata = {
  title: 'Avisa de tu llegada',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

// `params` es una Promise en esta versión de Next (ver AGENTS.md).
export default async function CheckInQrPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicCheckInView qrToken={token} />;
}
