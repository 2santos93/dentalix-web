import type { InventoryMovement, InventoryMovementType } from '@/lib/inventory/inventory-api';

export const MOVEMENT_TYPE_LABELS: Record<InventoryMovementType, string> = {
  IN: 'Entrada',
  OUT: 'Salida',
  ADJUSTMENT: 'Ajuste',
};

// Tonos de chip: la entrada es el camino feliz (success); la salida, un hecho
// neutro (sacar stock no es un problema); el ajuste, una corrección manual que
// merece un segundo vistazo (warning). Los mismos en la lista y en la ficha.
export const MOVEMENT_TYPE_VARIANT: Record<InventoryMovementType, 'success' | 'neutral' | 'warning'> = {
  IN: 'success',
  OUT: 'neutral',
  ADJUSTMENT: 'warning',
};

/** Cantidad con signo: IN suma, OUT resta, ADJUSTMENT lleva su propio signo. */
export function signedQuantity(m: InventoryMovement): string {
  if (m.type === 'IN') return `+${m.quantity}`;
  if (m.type === 'OUT') return `-${m.quantity}`;
  // ADJUSTMENT: el backend guarda la cantidad con su propio signo → tal cual.
  return `${m.quantity}`;
}
