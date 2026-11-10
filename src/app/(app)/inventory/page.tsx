'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { InventoryView } from '@/components/inventory/inventory-view';
import { RouteRoleGate } from '@/components/layouts/route-role-gate';

// El título y la descripción NO están aquí: los pinta `InventoryView` dentro de
// su `PageHeader`, porque la acción primaria va en esa cabecera y el estado que
// la abre es de la vista. La página solo resuelve la sesión.
export default function InventoryPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) {
    return null;
  }

  return (
    <RouteRoleGate href="/inventory" token={accessToken}>
      <InventoryView token={accessToken} />
    </RouteRoleGate>
  );
}
