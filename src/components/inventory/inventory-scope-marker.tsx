'use client';
import { Building2 } from 'lucide-react';
import { getTokenAllowedLocationIds } from '@/lib/auth/token-role';
import { useLocationsState } from '@/lib/locations/use-locations-state';

const copy = {
  location: (name: string) => `${name} · stock de esta sede`,
  // Cada insumo es de UNA sede (`InventoryItem.locationId`) y su stock sale de
  // sus propios movimientos: en la vista conjunta la API lista los insumos de
  // todas, cada uno con lo suyo. No suma el mismo insumo entre sedes.
  all: 'Todas las sedes · cada insumo con el stock de su sede, sin sumar',
  mine: 'Mis sedes · cada insumo con el stock de su sede, sin sumar',
};

/**
 * Marca de alcance del inventario en el hueco `meta` de `PageHeader`. Al
 * contrario que el catálogo (de toda la clínica, `ClinicWideNote`), el stock es
 * físico y por sede, así que la marca está SIEMPRE: también en «Todas las
 * sedes», donde dice que no hay suma. Mismo recuadro que la marca de Caja.
 */
export function InventoryScopeMarker({ token }: { token: string }) {
  const state = useLocationsState(token);
  if (state.status !== 'ready') return null;
  const active = state.activeLocationId
    ? state.locations.find((l) => l.id === state.activeLocationId) ?? null
    : null;
  const restricted = getTokenAllowedLocationIds(token) !== null;
  const text = active ? copy.location(active.name) : restricted ? copy.mine : copy.all;

  return (
    <p className="mt-3 inline-flex max-w-[68ch] items-start gap-2 rounded-lg bg-surface-sunken px-3 py-1.5 text-sm text-muted">
      <Building2 aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
      <span>{text}</span>
    </p>
  );
}
