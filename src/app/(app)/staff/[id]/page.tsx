'use client';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { PageHeader } from '@/components/molecules/page-header';
import { StaffMemberProfile } from '@/components/staff/staff-member-profile';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  title: 'Perfil del miembro',
  description: 'Cambia su nombre, su rol o su acceso a la clínica.',
  checkingSession: 'Verificando sesión…',
};

export default function StaffMemberPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const userId = params.id;
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    // Don't decide anything until the persisted store has rehydrated —
    // accessToken is null until then, and redirecting on that would bounce
    // an already-authenticated user.
    if (!hasHydrated) return;
    if (!accessToken) router.replace('/login');
  }, [accessToken, router, hasHydrated]);

  if (!hasHydrated) {
    return (
      <p role="status" className="text-sm text-muted">
        {copy.checkingSession}
      </p>
    );
  }
  if (!accessToken) return null;

  return (
    <>
      <PageHeader title={copy.title} description={copy.description} />
      <StaffMemberProfile token={accessToken} userId={userId} />
    </>
  );
}
