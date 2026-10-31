import type { ClinicRole } from '@/lib/me/me-api';
import { canWriteClinicalHistory } from '@/lib/clinical/clinical-roles';
import { canReadAccountStatement } from '@/lib/account-statement/account-statement-api';
import { canUsePerio } from '@/lib/perio/perio-api';
import { canUsePrescriptions } from '@/lib/prescriptions/prescriptions-api';
import { canReadAuditLog } from '@/lib/audit/audit-api';
import { canReadImplants } from '@/lib/implants/implants-api';
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
 * - Periodontograma y recetas: `CLINICAL_ROLES`.
 * - Consentimientos: los cuatro roles (DX-243: recepción envía a firmar a
 *   distancia y ve el estado; los documentos firmados, solo `CLINICAL_ROLES`,
 *   que la pestaña decide por dentro).
 * - Autorizaciones (Ley 1581), Implantes (DX-191), Documentos (DX-151) y
 *   Datos: los cuatro roles.
 * - Accesos (auditoría de la ficha, DX-009): `AUDIT_READ_ROLES` (solo ADMIN).
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
    consents: role !== null,
    perio: canUsePerio(role),
    prescriptions: canUsePrescriptions(role),
    implants: canReadImplants(role),
    documents: role !== null,
    'data-consents': role !== null,
    'access-log': canReadAuditLog(role),
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
