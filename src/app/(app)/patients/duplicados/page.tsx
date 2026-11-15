'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageDuplicates } from '@/lib/patients/patient-merge-api';
import { DuplicatesView } from '@/components/patients/duplicates-view';
import { RouteForbidden } from '@/components/layouts/route-role-gate';

// DX-266: «Posibles duplicados», solo ADMIN. Un rol sin acceso que llegue por
// URL ve el aviso de pantalla sin permiso (el mismo de `RouteRoleGate`) y no se
// pide nada; con un rol que no se pudo leer del token decide la API (403).
export default function DuplicatesPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;
  const role = getTokenRole(accessToken);
  if (role !== null && !canManageDuplicates(role)) return <RouteForbidden />;
  return <DuplicatesView token={accessToken} />;
}
