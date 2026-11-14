'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { StaffView } from '@/components/staff/staff-view';
import { RouteRoleGate } from '@/components/layouts/route-role-gate';

export default function StaffPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) {
    return null;
  }

  return (
    <RouteRoleGate href="/staff" token={accessToken}>
      <StaffView token={accessToken} />
    </RouteRoleGate>
  );
}
