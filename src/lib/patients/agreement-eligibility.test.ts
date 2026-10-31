import { agreementEligibility, agreementEligibilityCopy } from './agreement-eligibility';

const surco = { id: 'pay-surco', name: 'Surco Salud', type: 'PUBLIC_SYSTEM' as const };
const cortesia = { id: 'pay-cor', name: 'Cortesía', type: 'OTHER' as const };
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
    const coverages = [cov('c1', surco.id), cov('c2', surco.id, 'EXPIRED'), cov('c3', cortesia.id)];
    for (const role of ['ADMIN', 'DENTIST', 'ASSISTANT', 'RECEPTION'] as const) {
      expect(agreementEligibility({ payer: surco }, coverages, role, ME)).toEqual({
        kind: 'needs-coverage',
        coverages: [coverages[0]],
      });
    }
  });

  it('sin cobertura viva del pagador explica por qué no se puede asignar', () => {
    const out = agreementEligibility(
      { payer: surco },
      [cov('c2', surco.id, 'EXPIRED'), cov('c4', surco.id, 'NOT_STARTED')],
      'RECEPTION',
      ME,
    );
    expect(out).toEqual({
      kind: 'blocked',
      reason: agreementEligibilityCopy.noLiveCoverage('Surco Salud'),
    });
    expect(agreementEligibilityCopy.noLiveCoverage('Surco Salud')).toBe(
      'El paciente no tiene una cobertura vigente de «Surco Salud». Añádela en «Coberturas» y vuelve a asignar el convenio.',
    );
  });

  it('un convenio interno (pagador OTHER) solo lo asigna ADMIN, con la cobertura opcional', () => {
    const coverages = [cov('c3', cortesia.id), cov('c1', surco.id)];
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

  // Excepción G5.3 (DX-334): tipo de pagador anterior a DX-326.
  it('legacy: un pagador OTRO de una API anterior sigue siendo interno, solo ADMIN', () => {
    const legacy = { id: 'pay-old', name: 'Cortesía', type: 'OTRO' as never };
    const coverages = [cov('c3', legacy.id)];
    expect(agreementEligibility({ payer: legacy }, coverages, 'ADMIN', ME).kind).toBe('optional-coverage');
    expect(agreementEligibility({ payer: legacy }, coverages, 'DENTIST', ME)).toEqual({
      kind: 'blocked',
      reason: agreementEligibilityCopy.adminOnly,
    });
  });

  it('M2: una cobertura MIGRADA y vigente del pagador OTHER habilita a cualquier rol', () => {
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
      const mine = cov('c1', surco.id, 'ACTIVE', false, { declaredById: ME });
      const verified = cov('c2', surco.id, 'ACTIVE', false, {
        declaredById: ME,
        verifiedAt: '2026-10-20T15:00:00.000Z',
      });
      const byOther = cov('c3', surco.id);
      for (const role of ['DENTIST', 'ASSISTANT', 'RECEPTION'] as const) {
        expect(agreementEligibility({ payer: surco }, [mine, verified, byOther], role, ME)).toEqual(
          { kind: 'needs-coverage', coverages: [verified, byOther] },
        );
      }
    });

    it('si solo tiene las suyas sin verificar, explica qué falta', () => {
      const mine = cov('c1', surco.id, 'ACTIVE', false, { declaredById: ME });
      expect(agreementEligibility({ payer: surco }, [mine], 'RECEPTION', ME)).toEqual({
        kind: 'blocked',
        reason: agreementEligibilityCopy.selfDeclared('Surco Salud'),
      });
      expect(agreementEligibilityCopy.selfDeclared('Surco Salud')).toBe(
        'La cobertura de «Surco Salud» la registraste tú y aún no la ha verificado un administrador: pide a un administrador que la verifique en «Coberturas» (o que asigne él el convenio).',
      );
    });

    it('ADMIN usa cualquiera; una migrada vale para todos', () => {
      const mine = cov('c1', surco.id, 'ACTIVE', false, { declaredById: ME });
      expect(agreementEligibility({ payer: surco }, [mine], 'ADMIN', ME)).toEqual({
        kind: 'needs-coverage',
        coverages: [mine],
      });
      const migrated = cov('c2', surco.id, 'ACTIVE', true, { declaredById: null });
      expect(agreementEligibility({ payer: surco }, [migrated], 'RECEPTION', ME)).toEqual({
        kind: 'needs-coverage',
        coverages: [migrated],
      });
    });
  });
});
