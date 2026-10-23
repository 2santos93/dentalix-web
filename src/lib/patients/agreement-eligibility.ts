import type { ClinicRole } from '@/lib/me/me-api';
import type { Agreement } from '@/lib/agreements/agreements-api';
import type { PatientCoverage } from '@/lib/patients/coverages-api';

// SEC-047: quién puede asignar qué convenio. Es el espejo de la regla de la API
// (que es la que manda): un convenio de un pagador externo solo se asigna con
// una cobertura VIGENTE del paciente con ese pagador, sea cual sea el rol; uno
// interno —pagador de tipo OTRO: cortesía, empleados— solo lo asigna ADMIN.

export const agreementEligibilityCopy = {
  noLiveCoverage: (payer: string) =>
    `El paciente no tiene una cobertura vigente de «${payer}». Añádela en «Coberturas» y vuelve a asignar el convenio.`,
  adminOnly:
    'Este convenio no es de un pagador externo (cortesía, empleados…): solo un administrador puede asignarlo.',
};

type PayerType = Agreement['payer']['type'];
type CoverageLike = Pick<PatientCoverage, 'id' | 'status'> & {
  payer: Pick<PatientCoverage['payer'], 'id'>;
};

export type AgreementEligibility<C extends CoverageLike> =
  /** Pagador externo: hay que elegir una de estas coberturas (al menos una). */
  | { kind: 'needs-coverage'; coverages: C[] }
  /** Convenio interno y ADMIN: la cobertura es opcional. */
  | { kind: 'optional-coverage'; coverages: C[] }
  /** No se puede asignar: `reason` lo explica. */
  | { kind: 'blocked'; reason: string };

/** ¿Es un pagador externo real? `OTRO` es el de los convenios internos. */
export function isExternalPayer(type: PayerType): boolean {
  return type !== 'OTRO';
}

export function agreementEligibility<C extends CoverageLike>(
  agreement: { payer: { id: string; name: string; type: PayerType } },
  coverages: readonly C[],
  role: ClinicRole | null,
): AgreementEligibility<C> {
  const live = coverages.filter((c) => c.payer.id === agreement.payer.id && c.status === 'ACTIVE');
  if (!isExternalPayer(agreement.payer.type)) {
    return role === 'ADMIN'
      ? { kind: 'optional-coverage', coverages: live }
      : { kind: 'blocked', reason: agreementEligibilityCopy.adminOnly };
  }
  return live.length > 0
    ? { kind: 'needs-coverage', coverages: live }
    : {
        kind: 'blocked',
        reason: agreementEligibilityCopy.noLiveCoverage(agreement.payer.name),
      };
}
