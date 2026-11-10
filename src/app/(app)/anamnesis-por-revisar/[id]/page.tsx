'use client';
import { useParams } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canReviewAnamnesis } from '@/lib/anamnesis/anamnesis-api';
import { AnamnesisReviewView } from '@/components/anamnesis/anamnesis-review-view';

// Revisión de una anamnesis enviada por enlace (DX-099). «Aceptar» y
// «Rechazar» solo se pintan para ADMIN y DENTIST; la API lo vuelve a exigir.
export default function AnamnesisReviewPage() {
  const { id } = useParams<{ id: string }>();
  const accessToken = useAuthStore((s) => s.accessToken);

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
