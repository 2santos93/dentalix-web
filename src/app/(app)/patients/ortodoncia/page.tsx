'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { OrthoFollowUpView } from '@/components/ortho/ortho-follow-up-view';

// DX-190: Pacientes › Ortodoncia, para los cuatro roles (recepción llama y agenda).
export default function OrthoFollowUpPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;
  return <OrthoFollowUpView token={accessToken} />;
}
