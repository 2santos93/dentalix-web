'use client';
import { Suspense } from 'react';
import { useAuthStore } from '@/lib/auth/auth-store';
import { LEADS_HREF } from '@/lib/leads/leads-api';
import { LeadsView } from '@/components/leads/leads-view';
import { RouteRoleGate } from '@/components/layouts/route-role-gate';

/**
 * «Prospectos» (DX-556): ADMIN y RECEPTION (LEAD_ROLES en la API). La vista y
 * los filtros viven en la URL (`useSearchParams` exige un límite de Suspense).
 */
export default function LeadsPage() {
  return (
    <Suspense fallback={null}>
      <LeadsPageView />
    </Suspense>
  );
}

function LeadsPageView() {
  const accessToken = useAuthStore((s) => s.accessToken);
  if (!accessToken) return null;
  return (
    <RouteRoleGate href={LEADS_HREF} token={accessToken}>
      <LeadsView token={accessToken} />
    </RouteRoleGate>
  );
}
