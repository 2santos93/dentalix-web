import type { Metadata } from 'next';
import { PublicPatientPortalView } from '@/components/patient-access/public-patient-portal-view';

// Página PÚBLICA del paciente (DX-101), fuera de `(app)`: sin sesión del
// personal ni shell. La clínica sale del host (el cliente HTTP manda
// `X-Tenant-Host`). `proxy.ts` pone `Referrer-Policy: no-referrer`,
// `Cache-Control: no-store` y `X-Robots-Tag: noindex`: el token va en la URL
// y la página enseña citas, presupuestos y saldo.
export const metadata: Metadata = {
  title: 'Mi clínica',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

// `params` es una Promise en esta versión de Next (ver AGENTS.md).
export default async function PatientPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicPatientPortalView linkToken={token} />;
}
