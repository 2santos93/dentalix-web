import type { ClinicRole } from '@/lib/me/me-api';
import { canWriteClinicalHistory } from '@/lib/clinical/clinical-roles';
import { canReadAccountStatement } from '@/lib/account-statement/account-statement-api';
import { canUseConsents } from '@/lib/consents/consents-api';
import { canUsePerio } from '@/lib/perio/perio-api';
import {
  isPatientDetailTabKey,
  type PatientDetailTabKey,
} from '@/components/patients/patient-detail-tabs';

export type PatientTabAccess = Record<PatientDetailTabKey, boolean>;

/**
 * Qué pestañas de la ficha puede abrir cada rol: las mismas que la API le deja
 * LEER, para no enseñar una pestaña que acaba en 403 («Insufficient role»).
 *
 * - Historia clínica, odontograma y plan de tratamiento: `CLINICAL_ROLES`
 *   (todos menos recepción; ver medical-history, clinical-entries, odontogram
 *   y treatment-plans en la API).
 * - Estado de cuenta: `PAYMENT_ROLES` (ADMIN y recepción).
 * - Consentimientos y periodontograma: `CLINICAL_ROLES`.
 * - Autorizaciones (Ley 1581) y Datos: los cuatro roles.
 *
 * Solo decide qué se PINTA; el servidor vuelve a comprobar el rol. `null` (sin
 * rol de clínica legible) deja únicamente «Datos».
 */
export function patientTabAccess(role: ClinicRole | null): PatientTabAccess {
  const clinical = canWriteClinicalHistory(role);
  return {
    data: true,
    'clinical-history': clinical,
    odontogram: clinical,
    'treatment-plans': clinical,
    'account-statement': canReadAccountStatement(role),
    consents: canUseConsents(role),
    perio: canUsePerio(role),
    'data-consents': role !== null,
  };
}

/**
 * La pestaña a abrir a partir de `?tab=`: un valor desconocido, ausente o de
 * una pestaña que el rol no puede ver (p. ej. un enlace compartido) cae en
 * «Datos».
 */
export function resolvePatientTab(
  requested: string | null | undefined,
  access: PatientTabAccess,
): PatientDetailTabKey {
  return isPatientDetailTabKey(requested) && access[requested] ? requested : 'data';
}
