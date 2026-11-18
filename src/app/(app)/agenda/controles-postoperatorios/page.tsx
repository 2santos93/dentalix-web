'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { PostOpChecksView } from '@/components/post-op-checks/post-op-checks-view';

// «Controles postoperatorios» (DX-566), desde la Agenda y «Mi día». Los cuatro
// roles ven la lista; el detalle clínico y «Registrar resultado», solo los
// clínicos (la API lo recorta igual para recepción).
export default function PostOpChecksPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;
  return <PostOpChecksView token={accessToken} />;
}
