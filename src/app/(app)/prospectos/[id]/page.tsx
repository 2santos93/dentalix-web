'use client';
import { useParams } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { LEADS_HREF } from '@/lib/leads/leads-api';
import { LeadDetailView } from '@/components/leads/lead-detail-view';
import { RouteRoleGate } from '@/components/layouts/route-role-gate';

/** La ficha de un prospecto (DX-556): ADMIN y RECEPTION, como la bandeja. */
export default function LeadPage() {
  const { id } = useParams<{ id: string }>();
  const accessToken = useAuthStore((s) => s.accessToken);
  if (!accessToken) return null;
  return (
    <RouteRoleGate href={LEADS_HREF} token={accessToken}>
      <LeadDetailView key={id} token={accessToken} leadId={id} />
    </RouteRoleGate>
  );
}
