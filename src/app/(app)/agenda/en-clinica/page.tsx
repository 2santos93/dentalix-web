'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { InClinicView } from '@/components/appointments/in-clinic-view';

/**
 * DX-200: el panel «En clínica» a pantalla completa (p. ej. en la tablet del
 * mostrador o desde el contador «Te esperan» del odontólogo).
 */
export default function InClinicPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;

  return <InClinicView token={accessToken} />;
}
