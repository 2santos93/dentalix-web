'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { RecallView } from '@/components/recall/recall-view';

// Lista de recall (DX-015). Mismo guard de sesión que la caja. Un rol sin
// acceso que llegue por URL ve el aviso de la propia vista (la API responde 403).
export default function RecallPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;
  return <RecallView token={accessToken} />;
}
