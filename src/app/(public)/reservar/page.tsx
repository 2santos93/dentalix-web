import type { Metadata } from 'next';
import { PublicBookingView } from '@/components/online-booking/public-booking-view';

// Página PÚBLICA de reserva online (DX-016), fuera de `(app)`: sin sesión ni
// shell. La clínica sale del host (el cliente HTTP manda `X-Tenant-Host`) y su
// marca, del layout raíz. Lleva datos personales: sin indexar, sin Referer ni
// caché (también en la respuesta, `HEALTH_FORM_PREFIXES` de `proxy.ts`).
export const metadata: Metadata = {
  title: 'Reserva tu cita',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function PublicBookingPage() {
  return <PublicBookingView />;
}
