'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { ClosingQueueView } from '@/components/appointments/closing-queue-view';

// «Pendiente de cerrar» (DX-439), desde la Agenda. Mismo guard de sesión que
// el resto: un rol sin acceso que llegue por URL ve el aviso de la vista (la
// API da 403 en español).
export default function ClosingQueuePage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;
  return <ClosingQueueView token={accessToken} />;
}
