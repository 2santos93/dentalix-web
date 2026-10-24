import type { Metadata } from 'next';
import { PublicAnamnesisView } from '@/components/anamnesis/public-anamnesis-view';

// Página PÚBLICA para el paciente (DX-099), fuera de `(app)`: sin sesión ni
// shell. La clínica sale del host (el cliente HTTP manda `X-Tenant-Host`).
// Además de esto, `proxy.ts` pone `Referrer-Policy: no-referrer`,
// `Cache-Control: no-store` y `X-Robots-Tag: noindex` en la respuesta: es un
// formulario de salud con el token en la URL.
export const metadata: Metadata = {
  title: 'Cuestionario de salud',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

// `params` es una Promise en esta versión de Next (ver AGENTS.md /
// node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md).
export default async function AnamnesisPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicAnamnesisView linkToken={token} />;
}
