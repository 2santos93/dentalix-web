'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { ComingOfAgeView } from '@/components/patients/coming-of-age-view';

// DX-342: «Cumplen la mayoría de edad». Mismo guard de sesión que el recall: un
// rol sin acceso que llegue por URL ve el aviso de la propia vista (la API da 403).
export default function ComingOfAgePage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;
  return <ComingOfAgeView token={accessToken} />;
}
