'use client';
import { useParams } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { InventoryItem } from '@/components/inventory/inventory-item-detail';

// El título, el enlace de vuelta y las acciones los pinta `InventoryItem` en su
// `PageHeader`: el título es el nombre del insumo, que solo la vista conoce.
export default function InventoryItemPage() {
  const params = useParams<{ id: string }>();
  const itemId = params.id;
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) {
    return null;
  }

  return <InventoryItem token={accessToken} id={itemId} />;
}
