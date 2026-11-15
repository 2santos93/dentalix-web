import type { Metadata } from 'next';
import { PublicCertificateCopyView } from '@/components/certificates/public-certificate-copy-view';

// Página PÚBLICA (DX-306): la copia del justificante o del certificado de
// reposo que la clínica envió al paciente por WhatsApp. Fuera de `(app)`: sin
// sesión ni shell. La clínica sale del host (el cliente HTTP manda
// `X-Tenant-Host`). Bajo `/certificado`, `proxy.ts` añade `Referrer-Policy:
// no-referrer`, `Cache-Control: no-store` y `X-Robots-Tag: noindex`: el token va
// en la URL y un certificado anulado se ve en la siguiente carga.
export const metadata: Metadata = {
  title: 'Tu certificado',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

// `params` es una Promise en esta versión de Next.
export default async function CertificateCopyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicCertificateCopyView token={token} />;
}
