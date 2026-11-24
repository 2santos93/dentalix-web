import type { Metadata } from 'next';
import { CheckInPosterView } from '@/components/locations/check-in-poster';

// DX-265: el cartel imprimible del QR de llegada de una sede. El token del QR
// solo existe en el navegador de quien lo acaba de generar: viaja en el
// fragmento (`#…`), que nunca llega al servidor ni a los registros.
export const metadata: Metadata = {
  title: 'Cartel de llegada',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function CheckInPosterPage() {
  return <CheckInPosterView />;
}
