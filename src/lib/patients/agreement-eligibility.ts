import type { ClinicRole } from '@/lib/me/me-api';
import type { Agreement } from '@/lib/agreements/agreements-api';
import type { PatientCoverage } from '@/lib/patients/coverages-api';
import { isExternalPayer } from '@/lib/payers/payer-type';

// SEC-047: quién puede asignar qué convenio. Es el espejo de la regla de la API
// (que es la que manda): un convenio de un pagador externo solo se asigna con
// una cobertura VIGENTE del paciente con ese pagador, sea cual sea el rol; uno
// interno —pagador de tipo OTHER: cortesía, empleados— solo lo asigna ADMIN,
// salvo que el paciente traiga una cobertura MIGRADA de su aseguradora en texto
// libre (DX-153) de ese pagador: el relleno creó pagadores OTHER para
// aseguradoras reales y esa cobertura no se puede crear por la API.
// SEC-049: quien no es ADMIN tampoco puede usar una cobertura cuyo pagador o nº
// de afiliado registró él mismo si un ADMIN no la verificó.

export const agreementEligibilityCopy = {
  noLiveCoverage: (payer: string) =>
    `El paciente no tiene una cobertura vigente de «${payer}». Añádela en «Coberturas» y vuelve a asignar el convenio.`,
  adminOnly:
    'Este convenio no es de un pagador externo (cortesía, empleados…): solo un administrador puede asignarlo. Si es una aseguradora, pide al administrador que reclasifique el pagador.',
  selfDeclared: (payer: string) =>
    `La cobertura de «${payer}» la registraste tú y aún no la ha verificado un administrador: pide a un administrador que la verifique en «Coberturas» (o que asigne él el convenio).`,
  reclassify: (payer: string) =>
    `El pagador «${payer}» es de tipo «Otro / interno»: solo un administrador puede asignar este convenio. Si es una aseguradora o una empresa, reclasifica el pagador en Ajustes › Pagadores.`,
};

type PayerType = Agreement['payer']['type'];
type CoverageLike = Pick<
  PatientCoverage,
  'id' | 'status' | 'migratedFromLegacyInsurer' | 'declaredById' | 'verifiedAt'
> & {
  payer: Pick<PatientCoverage['payer'], 'id'>;
};

export type AgreementEligibility<C extends CoverageLike> =
  /** Hay que elegir una de estas coberturas (al menos una). */
  | { kind: 'needs-coverage'; coverages: C[] }
  /** Convenio interno y ADMIN: la cobertura es opcional; `notice`, el aviso de reclasificar. */
  | { kind: 'optional-coverage'; coverages: C[]; notice: string }
  /** No se puede asignar: `reason` lo explica. */
  | { kind: 'blocked'; reason: string };

/**
 * SEC-049: ¿puede la sesión usar esa cobertura? ADMIN, sí; los demás, si un
 * ADMIN la verificó, si es migrada o si su pagador y su nº los registró otro
 * (sin autor conocido cuenta como otro, igual que en la API).
 */
function trustedFor(c: CoverageLike, role: ClinicRole | null, userId: string | null): boolean {
  if (role === 'ADMIN') return true;
  if (c.verifiedAt || c.migratedFromLegacyInsurer) return true;
  return c.declaredById === null || c.declaredById !== userId;
}

export function agreementEligibility<C extends CoverageLike>(
  agreement: { payer: { id: string; name: string; type: PayerType } },
  coverages: readonly C[],
  role: ClinicRole | null,
  userId: string | null,
): AgreementEligibility<C> {
  const live = coverages.filter((c) => c.payer.id === agreement.payer.id && c.status === 'ACTIVE');
  if (!isExternalPayer(agreement.payer.type)) {
    if (role === 'ADMIN') {
      return {
        kind: 'optional-coverage',
        coverages: live,
        notice: agreementEligibilityCopy.reclassify(agreement.payer.name),
      };
    }
    const migrated = live.filter((c) => c.migratedFromLegacyInsurer);
    return migrated.length > 0
      ? { kind: 'needs-coverage', coverages: migrated }
      : { kind: 'blocked', reason: agreementEligibilityCopy.adminOnly };
  }
  if (live.length === 0) {
    return {
      kind: 'blocked',
      reason: agreementEligibilityCopy.noLiveCoverage(agreement.payer.name),
    };
  }
  const usable = live.filter((c) => trustedFor(c, role, userId));
  return usable.length > 0
    ? { kind: 'needs-coverage', coverages: usable }
    : { kind: 'blocked', reason: agreementEligibilityCopy.selfDeclared(agreement.payer.name) };
}
