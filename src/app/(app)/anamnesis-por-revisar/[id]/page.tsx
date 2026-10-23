'use client';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canReviewAnamnesis } from '@/lib/anamnesis/anamnesis-api';
import { AnamnesisReviewView } from '@/components/anamnesis/anamnesis-review-view';

// Revisión de una anamnesis enviada por enlace (DX-099). «Aceptar» y
// «Rechazar» solo se pintan para ADMIN y DENTIST; la API lo vuelve a exigir.
const copy = { checkingSession: 'Verificando sesión…' };

export default function AnamnesisReviewPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (hasHydrated && !accessToken) router.replace('/login');
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
    <AnamnesisReviewView
      key={id}
      token={accessToken}
      submissionId={id}
      canReview={canReviewAnamnesis(getTokenRole(accessToken))}
    />
  );
}
