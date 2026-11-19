'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { AnamnesisInboxView } from '@/components/anamnesis/anamnesis-inbox-view';
import { RouteRoleGate } from '@/components/layouts/route-role-gate';
import { ANAMNESIS_HREF } from '@/components/layouts/nav-config';

// «Anamnesis por revisar» (DX-099). Mismo guard de sesión que el resto. Un rol
// sin acceso que llegue por URL ve el aviso de pantalla sin permiso del menú
// (DX-208: antes la vista pedía la bandeja y pintaba el 403 como «No se pudo
// cargar» con «Reintentar», como si fuera un fallo de red).
export default function AnamnesisInboxPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;
  return (
    <RouteRoleGate href={ANAMNESIS_HREF} token={accessToken}>
      <AnamnesisInboxView token={accessToken} />
    </RouteRoleGate>
  );
}
