'use client';
import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { getActiveLocationId } from '@/lib/locations/location-store';

/**
 * Aviso de alcance para las vistas cuyo dato es de LA CLÍNICA y no de la sede
 * (pacientes, catálogo, historia clínica…): con una sede activa en el selector,
 * esas pantallas siguen mostrando todo y sin decirlo parecen ignorar el filtro.
 * Ver `PRODUCT.md` → "Multi-sede — ficha centralizada".
 *
 * Solo aparece cuando hay una sede CONCRETA activa: en "Todas las sedes" no hay
 * ninguna contradicción que explicar y el aviso sería ruido.
 */
export function ClinicWideNote({ children }: { children: React.ReactNode }) {
  const [hasActiveLocation, setHasActiveLocation] = useState(false);

  // Igual que `LocationSwitcher`: localStorage solo existe en el cliente, así
  // que no puede leerse como estado inicial sin romper la hidratación.
  useEffect(() => {
    function hydrate() {
      setHasActiveLocation(getActiveLocationId() !== null);
    }
    hydrate();
  }, []);

  if (!hasActiveLocation) return null;

  return (
    <p className="mb-4 flex items-center gap-2 text-sm text-muted">
      <Building2 aria-hidden className="size-4 shrink-0" />
      {children}
    </p>
  );
}
