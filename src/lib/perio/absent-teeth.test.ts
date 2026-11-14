import { absentTeethFrom, loadAbsentTeeth } from './absent-teeth';
import { getOdontogram, type ToothGroup, type ToothRecord } from '@/lib/odontogram/odontogram-api';
import { listCatalogItems, type DentalCatalogItem } from '@/lib/odontogram/catalog-api';

jest.mock('../odontogram/odontogram-api', () => ({ getOdontogram: jest.fn() }));
jest.mock('../odontogram/catalog-api', () => ({ listCatalogItems: jest.fn() }));

const CODES = new Map([
  ['c-ausente', 'DX-AUSENTE'],
  ['c-exo', 'CX-EXO-SIMPLE'],
  ['c-cordal', 'CX-CORDAL-INCL'],
  ['c-impl', 'IMPL-IMPLANTE'],
  ['c-caries', 'DX-CARIES'],
]);

let seq = 0;
function rec(catalogItemId: string, kind: ToothRecord['kind'], status: ToothRecord['status']): ToothRecord {
  seq += 1;
  return {
    id: `r${seq}`,
    toothNumber: '',
    surfaces: [],
    kind,
    catalogItemId,
    status,
    recordedAt: `2026-10-${String(seq).padStart(2, '0')}T12:00:00.000Z`,
  };
}

function group(tooth: string, ...records: ToothRecord[]): ToothGroup {
  return { toothNumber: tooth, records: records.map((r) => ({ ...r, toothNumber: tooth })) };
}

describe('absentTeethFrom (DX-403)', () => {
  it('«Diente ausente» y una exodoncia realizada cuentan como ausentes', () => {
    const groups = [
      group('18', rec('c-ausente', 'DIAGNOSIS', 'COMPLETED')),
      group('38', rec('c-cordal', 'PROCEDURE', 'COMPLETED')),
      group('46', rec('c-exo', 'PROCEDURE', 'COMPLETED')),
      group('16', rec('c-caries', 'DIAGNOSIS', 'COMPLETED')),
    ];
    expect([...absentTeethFrom(groups, CODES)].sort()).toEqual([18, 38, 46]);
  });

  it('una exodoncia solo planificada no quita el diente', () => {
    expect(absentTeethFrom([group('46', rec('c-exo', 'PROCEDURE', 'PLANNED'))], CODES).size).toBe(0);
  });

  it('un implante realizado después vuelve a dejar qué sondar; gana el último registro', () => {
    const groups = [
      group('36', rec('c-exo', 'PROCEDURE', 'COMPLETED'), rec('c-impl', 'PROCEDURE', 'COMPLETED')),
      group('26', rec('c-impl', 'PROCEDURE', 'COMPLETED'), rec('c-ausente', 'DIAGNOSIS', 'PLANNED')),
    ];
    expect([...absentTeethFrom(groups, CODES)]).toEqual([26]);
  });

  it('ignora temporales y registros sin ítem de catálogo conocido', () => {
    const groups = [
      group('55', rec('c-ausente', 'DIAGNOSIS', 'COMPLETED')),
      group('17', rec('desconocido', 'DIAGNOSIS', 'COMPLETED')),
    ];
    expect(absentTeethFrom(groups, CODES).size).toBe(0);
  });

  it('loadAbsentTeeth cruza el odontograma con el catálogo completo (también desactivados)', async () => {
    (getOdontogram as jest.Mock).mockResolvedValue([group('18', rec('c-ausente', 'DIAGNOSIS', 'COMPLETED'))]);
    (listCatalogItems as jest.Mock).mockResolvedValue([
      { id: 'c-ausente', code: 'DX-AUSENTE' } as DentalCatalogItem,
    ]);
    expect([...(await loadAbsentTeeth('tok', 'p1'))]).toEqual([18]);
    expect(getOdontogram).toHaveBeenCalledWith('tok', 'p1');
    expect(listCatalogItems).toHaveBeenCalledWith('tok');
  });
});
