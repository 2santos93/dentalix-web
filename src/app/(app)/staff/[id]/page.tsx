'use client';
import { useParams } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { StaffMemberProfile } from '@/components/staff/staff-member-profile';

export default function StaffMemberPage() {
  const params = useParams<{ id: string }>();
  const userId = params.id;
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;

  // La cabecera (nombre del miembro, estado, vuelta a Personal) la pinta el
  // perfil: es la única que conoce el nombre.
  return <StaffMemberProfile token={accessToken} userId={userId} />;
}
