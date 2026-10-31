import type { Metadata } from 'next';
import { PublicSignedCopyView } from '@/components/signature-requests/public-signed-copy-view';

// Página PÚBLICA para el paciente o su responsable (DX-443), fuera de `(app)`:
// sin sesión ni shell. La clínica sale del host (el cliente HTTP manda
// `X-Tenant-Host`). `proxy.ts` añade además `Referrer-Policy: no-referrer`,
// `Cache-Control: no-store` y `X-Robots-Tag: noindex`: el token de un solo uso
// va en la URL.
export const metadata: Metadata = {
  title: 'Tu copia del documento firmado',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

// `params` es una Promise en esta versión de Next (ver AGENTS.md /
// node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md).
export default async function SignedCopyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicSignedCopyView token={token} />;
}
