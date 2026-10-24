import { agreementEligibility, agreementEligibilityCopy } from './agreement-eligibility';

const sura = { id: 'pay-sura', name: 'Sura EPS', type: 'EPS_CO' as const };
const cortesia = { id: 'pay-cor', name: 'Cortesía', type: 'OTRO' as const };
const ME = 'user-me';
const cov = (
  id: string,
  payerId: string,
  status: 'ACTIVE' | 'EXPIRED' | 'NOT_STARTED' = 'ACTIVE',
  migratedFromInsurerEps = false,
  extra: { declaredById?: string | null; verifiedAt?: string | null } = {},
) => ({
  id,
  payer: { id: payerId },
  status,
  migratedFromInsurerEps,
  declaredById: 'user-other' as string | null,
  verifiedAt: null as string | null,
  ...extra,
});

describe('agreementEligibility (SEC-047)', () => {
  it('un convenio de pagador externo pide una cobertura viva de ese pagador, para cualquier rol', () => {
    const coverages = [cov('c1', sura.id), cov('c2', sura.id, 'EXPIRED'), cov('c3', cortesia.id)];
    for (const role of ['ADMIN', 'DENTIST', 'ASSISTANT', 'RECEPTION'] as const) {
      expect(agreementEligibility({ payer: sura }, coverages, role, ME)).toEqual({
        kind: 'needs-coverage',
        coverages: [coverages[0]],
      });
    }
  });

  it('sin cobertura viva del pagador explica por qué no se puede asignar', () => {
    const out = agreementEligibility(
      { payer: sura },
      [cov('c2', sura.id, 'EXPIRED'), cov('c4', sura.id, 'NOT_STARTED')],
      'RECEPTION',
      ME,
    );
    expect(out).toEqual({
      kind: 'blocked',
      reason: agreementEligibilityCopy.noLiveCoverage('Sura EPS'),
    });
    expect(agreementEligibilityCopy.noLiveCoverage('Sura EPS')).toBe(
      'El paciente no tiene una cobertura vigente de «Sura EPS». Añádela en «Coberturas» y vuelve a asignar el convenio.',
    );
  });

  it('un convenio interno (pagador OTRO) solo lo asigna ADMIN, con la cobertura opcional', () => {
    const coverages = [cov('c3', cortesia.id), cov('c1', sura.id)];
    expect(agreementEligibility({ payer: cortesia }, coverages, 'ADMIN', ME)).toEqual({
      kind: 'optional-coverage',
      coverages: [coverages[0]],
      notice: agreementEligibilityCopy.reclassify('Cortesía'),
    });
    for (const role of ['DENTIST', 'ASSISTANT', 'RECEPTION', null] as const) {
      expect(agreementEligibility({ payer: cortesia }, coverages, role, ME)).toEqual({
        kind: 'blocked',
        reason: agreementEligibilityCopy.adminOnly,
      });
    }
    expect(agreementEligibilityCopy.adminOnly).toBe(
      'Este convenio no es de un pagador externo (cortesía, empleados…): solo un administrador puede asignarlo. Si es una aseguradora, pide al administrador que reclasifique el pagador.',
    );
    expect(agreementEligibilityCopy.reclassify('Cortesía')).toBe(
      'El pagador «Cortesía» es de tipo «Otro / interno»: solo un administrador puede asignar este convenio. Si es una aseguradora o una empresa, reclasifica el pagador en Ajustes › Pagadores.',
    );
  });

  it('M2: una cobertura MIGRADA y vigente del pagador OTRO habilita a cualquier rol', () => {
    const migrated = cov('c5', cortesia.id, 'ACTIVE', true);
    const coverages = [cov('c3', cortesia.id), migrated, cov('c6', cortesia.id, 'EXPIRED', true)];
    for (const role of ['DENTIST', 'ASSISTANT', 'RECEPTION'] as const) {
      expect(agreementEligibility({ payer: cortesia }, coverages, role, ME)).toEqual({
        kind: 'needs-coverage',
        coverages: [migrated],
      });
    }
  });

  describe('SEC-049: cobertura verificable', () => {
    it('quien no es ADMIN no ve la cobertura que registró él y nadie verificó', () => {
      const mine = cov('c1', sura.id, 'ACTIVE', false, { declaredById: ME });
      const verified = cov('c2', sura.id, 'ACTIVE', false, {
        declaredById: ME,
        verifiedAt: '2026-10-20T15:00:00.000Z',
      });
      const byOther = cov('c3', sura.id);
      for (const role of ['DENTIST', 'ASSISTANT', 'RECEPTION'] as const) {
        expect(agreementEligibility({ payer: sura }, [mine, verified, byOther], role, ME)).toEqual(
          { kind: 'needs-coverage', coverages: [verified, byOther] },
        );
      }
    });

    it('si solo tiene las suyas sin verificar, explica qué falta', () => {
      const mine = cov('c1', sura.id, 'ACTIVE', false, { declaredById: ME });
      expect(agreementEligibility({ payer: sura }, [mine], 'RECEPTION', ME)).toEqual({
        kind: 'blocked',
        reason: agreementEligibilityCopy.selfDeclared('Sura EPS'),
      });
      expect(agreementEligibilityCopy.selfDeclared('Sura EPS')).toBe(
        'La cobertura de «Sura EPS» la registraste tú y aún no la ha verificado un administrador: pide a un administrador que la verifique en «Coberturas» (o que asigne él el convenio).',
      );
    });

    it('ADMIN usa cualquiera; una migrada vale para todos', () => {
      const mine = cov('c1', sura.id, 'ACTIVE', false, { declaredById: ME });
      expect(agreementEligibility({ payer: sura }, [mine], 'ADMIN', ME)).toEqual({
        kind: 'needs-coverage',
        coverages: [mine],
      });
      const migrated = cov('c2', sura.id, 'ACTIVE', true, { declaredById: null });
      expect(agreementEligibility({ payer: sura }, [migrated], 'RECEPTION', ME)).toEqual({
        kind: 'needs-coverage',
        coverages: [migrated],
      });
    });
  });
});
