import type { Metadata } from 'next';
import { PublicPrescriptionCopyView } from '@/components/prescriptions/public-prescription-copy-view';

// Página PÚBLICA (DX-468): la copia informativa de una receta que la clínica
// envió al paciente por email o WhatsApp. Fuera de `(app)`: sin sesión ni
// shell. La clínica sale del host (el cliente HTTP manda `X-Tenant-Host`).
// Bajo `/receta`, `proxy.ts` añade `Referrer-Policy: no-referrer`,
// `Cache-Control: no-store` y `X-Robots-Tag: noindex`: el token va en la URL
// y una receta anulada se ve en la siguiente carga.
export const metadata: Metadata = {
  title: 'Copia de tu receta',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

// `params` es una Promise en esta versión de Next (ver AGENTS.md /
// node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md).
export default async function PrescriptionCopyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicPrescriptionCopyView token={token} />;
}
