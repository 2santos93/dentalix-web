import { ScanLine } from 'lucide-react';
import type { RowAction } from '@/components/shared/row-actions';
import type { ClinicRole } from '@/lib/me/me-api';
import { canExportImaging } from '@/lib/patients/patients-api';

/** El texto de la entrada del menú y del título del diálogo (DX-484). */
export const IMAGING_EXPORT_ACTION = 'Datos para el software de imagen';

/**
 * La entrada del menú «⋯» de la ficha, solo para los roles clínicos (DENTIST,
 * ASSISTANT, ADMIN: los mismos que la API). `null` para recepción o sin rol.
 *
 * Aparte del diálogo (DX-202-bis): la ficha pinta la entrada de primeras y el
 * diálogo llega bajo demanda al elegirla (`patient-lazy-tabs`).
 */
export function imagingExportMenuAction(role: ClinicRole | null, onSelect: () => void): RowAction | null {
  if (!canExportImaging(role)) return null;
  return {
    label: IMAGING_EXPORT_ACTION,
    icon: <ScanLine aria-hidden />,
    onSelect,
  };
}
