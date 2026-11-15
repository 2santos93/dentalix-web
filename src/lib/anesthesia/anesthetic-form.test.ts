import type { AnestheticProduct } from './anesthesia-api';
import {
  draftFrom,
  emptyDraft,
  parseDecimalText,
  rangeMessage,
  toCreateInput,
  toUpdatePatch,
  validateDraft,
} from './anesthetic-form';

const lido: AnestheticProduct = {
  id: 'a1',
  name: 'Lidocaína 2 % con epinefrina 1:100.000',
  activeIngredient: 'Lidocaína',
  concentrationPct: 2,
  vasoconstrictor: 'Epinefrina 1:100.000',
  mlPerCarpule: 1.8,
  maxMgPerKg: 7,
  maxAbsoluteMg: 500,
  pediatricMaxMgPerKg: 4.4,
  minAgeYears: null,
  epinephrineMgPerCarpule: 0.018,
  sampleCode: 'LIDOCAINE_2_EPI',
  active: true,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

const valid = {
  ...emptyDraft(),
  name: ' Mepivacaína 3 % ',
  activeIngredient: 'Mepivacaína',
  concentrationPct: '3',
  mlPerCarpule: '1,8',
  maxMgPerKg: '6,6',
  maxAbsoluteMg: '400',
};

describe('anestésico: formulario (DX-408)', () => {
  it('lee coma o punto con los decimales permitidos', () => {
    expect(parseDecimalText('1,8', 2)).toBe(1.8);
    expect(parseDecimalText('0.018', 4)).toBe(0.018);
    expect(parseDecimalText('1,234', 2)).toBeNull();
    expect(parseDecimalText('4', 0)).toBe(4);
    expect(parseDecimalText('4,5', 0)).toBeNull();
    expect(parseDecimalText('-1', 2)).toBeNull();
    expect(parseDecimalText('abc', 2)).toBeNull();
  });

  it('el mensaje dice el rango de la API y los decimales', () => {
    expect(rangeMessage('concentrationPct')).toBe('Escribe un número entre 0,01 y 10, con hasta 2 decimales.');
    expect(rangeMessage('maxAbsoluteMg')).toBe('Escribe un número entre 1 y 2000, con hasta 1 decimal.');
    expect(rangeMessage('minAgeYears')).toBe('Escribe un número entero entre 0 y 18.');
    expect(rangeMessage('epinephrineMgPerCarpule')).toBe('Escribe un número entre 0 y 0,2, con hasta 4 decimales.');
  });

  it('valida obligatorios y rangos (> 0 y topes de la API)', () => {
    const result = validateDraft({
      ...emptyDraft(),
      concentrationPct: '0',
      mlPerCarpule: '6',
      maxMgPerKg: '25',
      maxAbsoluteMg: '0',
      minAgeYears: '19',
      epinephrineMgPerCarpule: '0,5',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(
      [
        'activeIngredient',
        'concentrationPct',
        'epinephrineMgPerCarpule',
        'maxAbsoluteMg',
        'maxMgPerKg',
        'minAgeYears',
        'mlPerCarpule',
        'name',
      ].sort(),
    );
    expect(result.errors.name).toMatch(/nombre/);
  });

  it('alta: recorta, vasoconstrictor vacío = null y la epinefrina vacía no se envía', () => {
    const result = validateDraft(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(toCreateInput(result.value)).toEqual({
      name: 'Mepivacaína 3 %',
      activeIngredient: 'Mepivacaína',
      vasoconstrictor: null,
      concentrationPct: 3,
      mlPerCarpule: 1.8,
      maxMgPerKg: 6.6,
      maxAbsoluteMg: 400,
      pediatricMaxMgPerKg: null,
      minAgeYears: null,
    });
  });

  it('edición: el borrador refleja el producto y sin cambios no hay parche', () => {
    const draft = draftFrom(lido);
    expect(draft.mlPerCarpule).toBe('1,8');
    expect(draft.epinephrineMgPerCarpule).toBe('0,018');
    const result = validateDraft(draft);
    if (!result.ok) throw new Error('debería validar');
    expect(toUpdatePatch(lido, result.value)).toEqual({});
  });

  it('edición: solo lo que cambió', () => {
    const result = validateDraft({ ...draftFrom(lido), maxAbsoluteMg: '300', minAgeYears: '4' });
    if (!result.ok) throw new Error('debería validar');
    expect(toUpdatePatch(lido, result.value)).toEqual({ maxAbsoluteMg: 300, minAgeYears: 4 });
  });

  it('edición: vaciar la epinefrina pide recalcularla reenviando el vasoconstrictor', () => {
    const result = validateDraft({ ...draftFrom(lido), epinephrineMgPerCarpule: '' });
    if (!result.ok) throw new Error('debería validar');
    expect(toUpdatePatch(lido, result.value)).toEqual({ vasoconstrictor: 'Epinefrina 1:100.000' });
  });
});
