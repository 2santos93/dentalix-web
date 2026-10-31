import type { Metadata } from 'next';
import { PublicSignatureView } from '@/components/signature-requests/public-signature-view';

// Página PÚBLICA para el paciente (DX-243), fuera de `(app)`: sin sesión ni
// shell. La clínica sale del host (el cliente HTTP manda `X-Tenant-Host`).
// Además de esto, `proxy.ts` pone `Referrer-Policy: no-referrer`,
// `Cache-Control: no-store` y `X-Robots-Tag: noindex` en la respuesta: lleva
// el token en la URL y, tras el código, un documento clínico.
export const metadata: Metadata = {
  title: 'Firmar documento',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

// `params` es una Promise en esta versión de Next (ver AGENTS.md /
// node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md).
export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicSignatureView linkToken={token} />;
}
