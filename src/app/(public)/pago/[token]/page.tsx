import type { Metadata } from 'next';
import { PublicPaymentLinkView } from '@/components/payment-links/public-payment-link-view';

// Página PÚBLICA del enlace de pago (DX-569), fuera de `(app)`: sin sesión ni
// shell. La clínica sale del host (el cliente HTTP manda `X-Tenant-Host`).
// `proxy.ts` pone `Referrer-Policy: no-referrer`, `Cache-Control: no-store` y
// `X-Robots-Tag: noindex`: el token va en la URL y la página lleva los datos
// para pagar de la clínica.
export const metadata: Metadata = {
  title: 'Reporta tu pago',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

// `params` es una Promise en esta versión de Next (ver AGENTS.md).
export default async function PaymentLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicPaymentLinkView linkToken={token} />;
}
