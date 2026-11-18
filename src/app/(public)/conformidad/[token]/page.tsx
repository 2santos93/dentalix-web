import type { Metadata } from 'next';
import { PublicCommissionReceiptView } from '@/components/commissions/public-commission-receipt-view';

// Página PÚBLICA de la conformidad del pago de honorarios (DX-464), fuera de
// `(app)`: sin sesión ni shell. La clínica sale del host (el cliente HTTP manda
// `X-Tenant-Host`). `proxy.ts` pone `Referrer-Policy: no-referrer`,
// `Cache-Control: no-store` y `X-Robots-Tag: noindex`: el token va en la URL y
// la página lleva el recibo del pago.
export const metadata: Metadata = {
  title: 'Recibo de honorarios',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

// `params` es una Promise en esta versión de Next (ver AGENTS.md).
export default async function CommissionReceiptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicCommissionReceiptView linkToken={token} />;
}
