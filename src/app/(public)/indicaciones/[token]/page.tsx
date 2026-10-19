import type { Metadata } from 'next';
import { PublicPostOpView } from '@/components/postop/public-postop-view';

// Página PÚBLICA para el paciente (DX-222), fuera de `(app)`: sin sesión ni
// shell. La clínica sale del host (el cliente HTTP manda `X-Tenant-Host`).
export const metadata: Metadata = {
  title: 'Tus indicaciones',
  // El token viaja en la URL: que no se indexe ni salga en el Referer hacia
  // terceros (p. ej. el logo de la clínica en otro dominio).
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

// `params` es una Promise en esta versión de Next (ver AGENTS.md /
// node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md).
export default async function PostOpInstructionsPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PublicPostOpView linkToken={token} />;
}
