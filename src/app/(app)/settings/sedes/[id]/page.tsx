'use client';
import { useParams } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { LocationDetail } from '@/components/locations/location-detail';

/**
 * Ficha de una sede (B6): sus datos, configuración regional, nº de registro
 * sanitario, política de cancelación (ADMIN) y el enlace a su calendario.
 * Todos los roles la leen; solo ADMIN cambia (la API decide).
 */
export default function LocationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;

  return <LocationDetail token={accessToken} locationId={id} />;
}
