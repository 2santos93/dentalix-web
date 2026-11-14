import { addMonths } from '@/lib/appointments/calendar-grid';
import {
  EQUIPMENT_CATEGORY_LABELS,
  type Equipment,
  type MaintenanceKind,
} from './equipment-api';

/** «Autoclave · Tuttnauer 2540EKA»: el tipo y, si los hay, marca y modelo. */
export function equipmentSubtitle(equipment: Pick<Equipment, 'category' | 'brand' | 'model'>): string {
  const make = [equipment.brand, equipment.model].filter(Boolean).join(' ');
  return [EQUIPMENT_CATEGORY_LABELS[equipment.category], make].filter(Boolean).join(' · ');
}

/**
 * El próximo que la API dejará si no se escribe uno (DX-542, misma regla):
 * un preventivo suma la periodicidad del equipo a su fecha; el resto, nada.
 * Solo lo PROPONE en el formulario: la API es la que lo fija.
 */
export function proposedNextDue(
  kind: MaintenanceKind,
  performedOn: string | null,
  intervalMonths: number | null,
): string | null {
  if (kind !== 'PREVENTIVE' || !performedOn || intervalMonths === null) return null;
  return addMonths(performedOn, intervalMonths);
}

/** Periodicidad escrita a mano: «» = sin programa; 1–120 meses enteros o `undefined` (inválida). */
export function parseIntervalMonths(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (!/^\d{1,3}$/.test(trimmed)) return undefined;
  const months = Number(trimmed);
  return months >= 1 && months <= 120 ? months : undefined;
}
