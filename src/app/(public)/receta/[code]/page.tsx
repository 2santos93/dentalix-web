import type { Metadata } from 'next';
import { PublicPrescriptionVerificationView } from '@/components/prescriptions/public-prescription-verification-view';

// Página PÚBLICA de verificación de una receta (DX-467), fuera de `(app)`: sin
// sesión ni shell. La abre quien tiene la receta impresa (la farmacia) con el
// QR o el código. La clínica sale del host (el cliente HTTP manda
// `X-Tenant-Host`). `proxy.ts` añade `Referrer-Policy: no-referrer`,
// `Cache-Control: no-store` y `X-Robots-Tag: noindex`.
export const metadata: Metadata = {
  title: 'Verificar receta',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

// `params` es una Promise en esta versión de Next (ver AGENTS.md /
// node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md).
export default async function PrescriptionVerificationPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <PublicPrescriptionVerificationView code={code} />;
}
