import { agreementEligibility, agreementEligibilityCopy } from './agreement-eligibility';

const sura = { id: 'pay-sura', name: 'Sura EPS', type: 'EPS_CO' as const };
const cortesia = { id: 'pay-cor', name: 'Cortesía', type: 'OTRO' as const };
const cov = (
  id: string,
  payerId: string,
  status: 'ACTIVE' | 'EXPIRED' | 'NOT_STARTED' = 'ACTIVE',
) => ({
  id,
  payer: { id: payerId },
  status,
});

describe('agreementEligibility (SEC-047)', () => {
  it('un convenio de pagador externo pide una cobertura viva de ese pagador, para cualquier rol', () => {
    const coverages = [cov('c1', sura.id), cov('c2', sura.id, 'EXPIRED'), cov('c3', cortesia.id)];
    for (const role of ['ADMIN', 'DENTIST', 'ASSISTANT', 'RECEPTION'] as const) {
      expect(agreementEligibility({ payer: sura }, coverages, role)).toEqual({
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
    expect(agreementEligibility({ payer: cortesia }, coverages, 'ADMIN')).toEqual({
      kind: 'optional-coverage',
      coverages: [coverages[0]],
    });
    for (const role of ['DENTIST', 'ASSISTANT', 'RECEPTION', null] as const) {
      expect(agreementEligibility({ payer: cortesia }, coverages, role)).toEqual({
        kind: 'blocked',
        reason: agreementEligibilityCopy.adminOnly,
      });
    }
    expect(agreementEligibilityCopy.adminOnly).toBe(
      'Este convenio no es de un pagador externo (cortesía, empleados…): solo un administrador puede asignarlo.',
    );
  });
});
