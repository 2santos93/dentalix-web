import { equipmentSubtitle, parseIntervalMonths, proposedNextDue } from './equipment-format';
import { canManageEquipment, equipmentPrintHref } from './equipment-api';

describe('equipos biomédicos: formato (DX-542)', () => {
  it('el subtítulo junta el tipo con la marca y el modelo que haya', () => {
    expect(equipmentSubtitle({ category: 'AUTOCLAVE', brand: 'Tuttnauer', model: '2540EKA' })).toBe(
      'Autoclave · Tuttnauer 2540EKA',
    );
    expect(equipmentSubtitle({ category: 'XRAY', brand: null, model: 'RX-70' })).toBe('Rayos X · RX-70');
    expect(equipmentSubtitle({ category: 'OTHER', brand: null, model: null })).toBe('Otro');
  });

  it('propone el próximo de un preventivo con la periodicidad, recortando a fin de mes', () => {
    expect(proposedNextDue('PREVENTIVE', '2026-08-31', 6)).toBe('2027-02-28');
    expect(proposedNextDue('CORRECTIVE', '2026-08-31', 6)).toBeNull();
    expect(proposedNextDue('PREVENTIVE', null, 6)).toBeNull();
    expect(proposedNextDue('PREVENTIVE', '2026-08-31', null)).toBeNull();
  });

  it('lee la periodicidad de 1 a 120 meses; vacía es «sin programa»', () => {
    expect(parseIntervalMonths('')).toBeNull();
    expect(parseIntervalMonths(' 6 ')).toBe(6);
    expect(parseIntervalMonths('0')).toBeUndefined();
    expect(parseIntervalMonths('121')).toBeUndefined();
    expect(parseIntervalMonths('6,5')).toBeUndefined();
  });

  it('solo ADMIN los gestiona y la hoja de vida se imprime fuera del shell', () => {
    expect(canManageEquipment('ADMIN')).toBe(true);
    expect(canManageEquipment('RECEPTION')).toBe(false);
    expect(canManageEquipment(null)).toBe(false);
    expect(equipmentPrintHref('a/b')).toBe('/print/equipment/a%2Fb');
  });
});
