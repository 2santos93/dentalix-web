import type { Metadata } from 'next';
import { WaitingRoomBoardView } from '@/components/waiting-room/waiting-room-board';

// Página PÚBLICA del televisor de la sala de espera (DX-588), fuera de
// `(app)`: sin sesión ni shell. La clínica sale del host (el cliente HTTP
// manda `X-Tenant-Host`, y la marca la resuelve el layout raíz por el host).
// `proxy.ts` pone `Referrer-Policy: no-referrer`, `Cache-Control: no-store` y
// `X-Robots-Tag: noindex`: el token va en la URL.
export const metadata: Metadata = {
  title: 'Sala de espera',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

// `params` es una Promise en esta versión de Next (ver AGENTS.md).
export default async function WaitingRoomScreenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <WaitingRoomBoardView screenToken={token} />;
}
