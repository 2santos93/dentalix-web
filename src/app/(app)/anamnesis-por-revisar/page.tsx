'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { AnamnesisInboxView } from '@/components/anamnesis/anamnesis-inbox-view';

// «Anamnesis por revisar» (DX-099). Mismo guard de sesión que el resto: un
// rol sin acceso que llegue por URL ve el aviso de la vista (la API da 403).
export default function AnamnesisInboxPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;
  return <AnamnesisInboxView token={accessToken} />;
}
