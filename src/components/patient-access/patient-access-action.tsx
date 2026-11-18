import { Share2 } from 'lucide-react';
import type { RowAction } from '@/components/shared/row-actions';
import type { ClinicRole } from '@/lib/me/me-api';

/** El texto de la entrada del menú «⋯» y del título del diálogo (DX-101). */
export const PATIENT_ACCESS_ACTION = 'Compartir con el paciente';

/**
 * ¿Puede compartir el enlace de acceso? ADMIN y recepción: el enlace enseña el
 * saldo (PAYMENT_ROLES en la API, como el estado de cuenta y el enlace de pago).
 */
export function canSharePatientAccess(role: ClinicRole | null): boolean {
  return role === 'ADMIN' || role === 'RECEPTION';
}

/**
 * La entrada del menú «⋯» de la ficha, o `null` para los roles clínicos. La
 * ficha pinta solo esto; el diálogo llega bajo demanda al elegirla
 * (`patient-lazy-tabs`).
 */
export function patientAccessMenuAction(role: ClinicRole | null, onSelect: () => void): RowAction | null {
  if (!canSharePatientAccess(role)) return null;
  return { label: PATIENT_ACCESS_ACTION, icon: <Share2 aria-hidden />, onSelect };
}
