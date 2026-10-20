import type { ClinicLocation } from '@/lib/locations/locations-api';

// Copy como constantes (i18n-ready).
const copy = {
  /**
   * `PrismaPaymentRepository.create` sella el abono con la sede del request
   * (`X-Location-Id`), y esa atribución es la que arquea la caja por sede.
   */
  inLocation: (name: string) => `Este abono quedará registrado en la sede ${name}.`,
  // Sin sede activa el backend cae en la sede por defecto de la clínica
  // (`resolveDefaultLocationId`: la primera activa). No se la nombra porque
  // ese orden es una decisión del backend que la UI no puede garantizar.
  defaultLocation:
    'Sin una sede activa, este abono quedará registrado en la sede por defecto de la clínica.',
  // DX-089: un miembro acotado a una sola sede no cae en la de la clínica sino
  // en la suya.
  assignedLocation: 'Sin una sede activa, este abono quedará en tu sede asignada.',
};

/**
 * En qué sede quedará un abono nuevo, dicho ANTES de escribir el monto. `null`
 * con una sola sede activa: ahí el concepto no aporta nada (misma regla que
 * `LocationSwitcher`).
 *
 * `allowedLocationIds` es el claim `loc` de la sesión (DX-089; `null` = todas):
 * acotado a una sola sede y sin sede activa, el abono queda en la suya — se
 * dice aunque solo vea esa sede, porque «sin sede activa» es justo lo que hay
 * que aclarar.
 */
export function paymentLocationHint(
  locations: Pick<ClinicLocation, 'id' | 'name' | 'isActive'>[],
  activeLocationId: string | null,
  allowedLocationIds: string[] | null = null,
): string | null {
  const active = locations.find((l) => l.id === activeLocationId);
  if (!active && allowedLocationIds?.length === 1) return copy.assignedLocation;
  if (locations.filter((l) => l.isActive).length < 2) return null;
  return active ? copy.inLocation(active.name) : copy.defaultLocation;
}
