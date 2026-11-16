import type { Metadata } from 'next';
import { PublicExternalOrderCopyView } from '@/components/external-orders/public-external-order-copy-view';

// Página PÚBLICA (DX-572): la copia de la orden de estudios o de la referencia
// que la clínica envió al paciente por email o WhatsApp, con un enlace de un
// solo uso. Fuera de `(app)`: sin sesión ni shell. La clínica sale del host (el
// cliente HTTP manda `X-Tenant-Host`). Bajo `/orden`, `proxy.ts` añade
// `Referrer-Policy: no-referrer`, `Cache-Control: no-store` y `X-Robots-Tag:
// noindex`: el token va en la URL.
export const metadata: Metadata = {
  title: 'Tu orden',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

// `params` es una Promise en esta versión de Next.
export default async function ExternalOrderCopyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicExternalOrderCopyView token={token} />;
}
