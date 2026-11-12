import {
  EXCLUSION_GROUP_PATTERN,
  currentPartnerId,
  exclusivePartners,
  newExclusionGroup,
  planExclusion,
} from './recall-exclusion';

const hyg = { id: 't-hyg', name: 'Higiene', exclusionGroup: 'HYGIENE_PERIO' };
const perio = { id: 't-perio', name: 'Mantenimiento periodontal', exclusionGroup: 'HYGIENE_PERIO' };
const ctl = { id: 't-ctl', name: 'Control', exclusionGroup: null };
const orto = { id: 't-orto', name: 'Retención de ortodoncia', exclusionGroup: null };
const TYPES = [hyg, ctl, perio, orto];

describe('recall-exclusion (DX-015-bis, D13)', () => {
  it('un grupo nuevo cumple el patrón de la API', () => {
    const group = newExclusionGroup(() => '3f9a0c21-aaaa-bbbb-cccc-000000000000');
    expect(group).toBe('G_3F9A0C21');
    expect(EXCLUSION_GROUP_PATTERN.test(group)).toBe(true);
    expect(EXCLUSION_GROUP_PATTERN.test(newExclusionGroup())).toBe(true);
  });

  it('los excluyentes de un tipo son los otros de su grupo; sin grupo, ninguno', () => {
    expect(exclusivePartners(hyg, TYPES)).toEqual([perio]);
    expect(exclusivePartners(ctl, TYPES)).toEqual([]);
    expect(currentPartnerId(perio, TYPES)).toBe('t-hyg');
    expect(currentPartnerId(ctl, TYPES)).toBeNull();
    expect(currentPartnerId(null, TYPES)).toBeNull();
  });

  it('lo mismo que había no cambia nada', () => {
    expect(planExclusion({ self: hyg, partnerId: 't-perio', types: TYPES })).toEqual({
      selfGroup: undefined,
      partnerPatch: null,
    });
    expect(planExclusion({ self: ctl, partnerId: null, types: TYPES })).toEqual({
      selfGroup: undefined,
      partnerPatch: null,
    });
    // Un tipo nuevo sin exclusión: nada que mandar.
    expect(planExclusion({ self: { id: null, exclusionGroup: null }, partnerId: null, types: TYPES })).toEqual({
      selfGroup: undefined,
      partnerPatch: null,
    });
  });

  it('«Ninguno» deja el grupo del tipo a null y no toca al otro', () => {
    expect(planExclusion({ self: hyg, partnerId: null, types: TYPES })).toEqual({
      selfGroup: null,
      partnerPatch: null,
    });
  });

  it('con un tipo que ya tiene grupo, usa el suyo (alta y edición)', () => {
    expect(planExclusion({ self: { id: null, exclusionGroup: null }, partnerId: 't-perio', types: TYPES })).toEqual({
      selfGroup: 'HYGIENE_PERIO',
      partnerPatch: null,
    });
    expect(planExclusion({ self: ctl, partnerId: 't-hyg', types: TYPES })).toEqual({
      selfGroup: 'HYGIENE_PERIO',
      partnerPatch: null,
    });
  });

  it('con un tipo sin grupo, crea uno para los dos y hace PATCH del otro', () => {
    expect(
      planExclusion({ self: ctl, partnerId: 't-orto', types: TYPES, makeGroup: () => 'G_NEW00001' }),
    ).toEqual({ selfGroup: 'G_NEW00001', partnerPatch: { id: 't-orto', exclusionGroup: 'G_NEW00001' } });
    // Higiene deja a Perio y pasa a excluir a Control: grupo nuevo, Perio no se toca.
    expect(
      planExclusion({ self: hyg, partnerId: 't-ctl', types: TYPES, makeGroup: () => 'G_NEW00002' }),
    ).toEqual({ selfGroup: 'G_NEW00002', partnerPatch: { id: 't-ctl', exclusionGroup: 'G_NEW00002' } });
  });

  it('el grupo nuevo no reutiliza uno que ya existe', () => {
    const groups = ['HYGIENE_PERIO', 'G_FRESH001'];
    const plan = planExclusion({ self: ctl, partnerId: 't-orto', types: TYPES, makeGroup: () => groups.shift()! });
    expect(plan.selfGroup).toBe('G_FRESH001');
  });

  it('un id que no está en la lista (o el propio tipo) cuenta como «Ninguno»', () => {
    expect(planExclusion({ self: hyg, partnerId: 't-gone', types: TYPES }).selfGroup).toBeNull();
    expect(planExclusion({ self: hyg, partnerId: 't-hyg', types: TYPES }).selfGroup).toBeNull();
  });
});
