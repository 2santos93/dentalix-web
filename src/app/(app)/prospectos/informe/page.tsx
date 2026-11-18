'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { LEADS_HREF } from '@/lib/leads/leads-api';
import { LeadReportView } from '@/components/leads/lead-report-view';
import { RouteRoleGate } from '@/components/layouts/route-role-gate';

/** «Informe de conversión» de los prospectos (DX-556): ADMIN y RECEPTION. */
export default function LeadReportPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  if (!accessToken) return null;
  return (
    <RouteRoleGate href={LEADS_HREF} token={accessToken}>
      <LeadReportView token={accessToken} />
    </RouteRoleGate>
  );
}
